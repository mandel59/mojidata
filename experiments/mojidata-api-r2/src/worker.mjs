import Factory from 'wa-sqlite/dist/wa-sqlite-async.mjs'
import * as SQLite from 'wa-sqlite'
import wasm from './sqlite.wasm'
import { createSqlApiDb } from '@mandel59/mojidata-api-core'
import { createApp } from '@mandel59/mojidata-api-hono'
import { Budget, LimitError, RangeStore } from './range-store.mjs'
import { R2VFS } from './r2-vfs.mjs'

let runtime
let requests = Promise.resolve()
let pending = 0

async function createRuntime(env, budget) {
  const module = await Factory({
    locateFile: () => 'sqlite.wasm',
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(wasm, imports)
      receive(instance)
      return instance.exports
    },
  })
  const sqlite = SQLite.Factory(module)
  const store = new RangeStore(env.DB, env.CACHE)
  store.budget = budget
  const vfs = new R2VFS(module, store, env.FILES)
  await vfs.isReady()
  sqlite.vfs_register(vfs, true)
  const handles = []
  let sqlQueue = Promise.resolve()
  let progressError
  function executor(db) {
    sqlite.progress_handler(db, 1000, () => {
      try { store.budget.charge('vmSteps', 1000); return 0 }
      catch (error) { progressError = error; return 1 }
    })
    const query = (sql, params) => {
      // Asyncify cannot interleave calls into the same Wasm instance. Core
      // intentionally uses Promise.all in some paths, so serialize here too.
      const result = sqlQueue.then(async () => {
        store.budget.charge('queries')
        if (vfs.lastError) throw vfs.lastError
        if (progressError) throw progressError
        const rows = []
        try {
          for await (const stmt of sqlite.statements(db, sql)) {
            if (params) sqlite.bind_collection(stmt, params)
            while (await sqlite.step(stmt) === SQLite.SQLITE_ROW) {
              store.budget.charge('rows')
              rows.push(Object.fromEntries(sqlite.column_names(stmt).map((name, i) => [name, sqlite.column(stmt, i)])))
            }
          }
        } catch (error) { throw vfs.lastError ?? progressError ?? error }
        return rows
      })
      sqlQueue = result.catch(() => {})
      return result
    }
    return { query, async queryOne(sql, params) { return (await query(sql, params))[0] ?? null } }
  }
  try {
    const executors = []
    for (const path of ['/moji.db', '/idsfind.db']) {
      const db = await sqlite.open_v2(path, SQLite.SQLITE_OPEN_READONLY, vfs.name)
      handles.push(db)
      sqlite.limit(db, SQLite.SQLITE_LIMIT_LENGTH, 4 * 1024 * 1024)
      sqlite.limit(db, SQLite.SQLITE_LIMIT_SQL_LENGTH, 128 * 1024)
      await sqlite.exec(db, 'PRAGMA query_only=ON; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-2048; PRAGMA mmap_size=0;')
      executors.push(executor(db))
    }
    const db = createSqlApiDb({ getMojidataDb: async () => executors[0], getIdsfindDb: async () => executors[1] })
    const app = createApp(db)
    app.onError(error => {
      const cause = vfs.lastError ?? progressError ?? error
      return Response.json({ error: cause.message }, { status: cause instanceof LimitError ? 422 : 500 })
    })
    return { module, sqlite, store, app, async drain() { await sqlQueue }, reset() { vfs.lastError = null; progressError = null }, async close() {
      for (const db of handles) await sqlite.close(db)
      vfs.close()
    } }
  } catch (error) {
    for (const db of handles) await sqlite.close(db)
    vfs.close()
    throw vfs.lastError ?? error
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS',
    } })
    if (request.method !== 'GET') return new Response('read-only experiment', { status: 405 })
    if (request.url.length > 2048) return new Response('query too long', { status: 414 })
    if (pending >= 4) return new Response('experiment queue full', { status: 503 })
    pending++
    const job = requests.then(async () => {
      const start = Date.now()
      const budget = new Budget(env.LIMITS)
      try {
        if (!runtime) runtime = await createRuntime(env, budget)
        else {
          runtime.store.budget = budget
          runtime.store.resetMetrics()
          runtime.reset()
        }
        const response = await runtime.app.fetch(request)
        // Drain any Promise.all siblings even when a request failed early.
        await runtime.drain()
        const result = new Response(response.body, response)
        result.headers.set('x-experiment-metrics', JSON.stringify({
          ...runtime.store.metrics, ...budget.used,
          cacheBytes: runtime.store.cacheBytes,
          wasmHeapBytes: runtime.module.HEAPU8.length,
          elapsedMs: Date.now() - start,
          sqliteVersion: runtime.sqlite.libversion(),
        }))
        if (!response.ok) {
          // Drop SQLite/page caches after an interrupted or failed query.
          await runtime.close()
          runtime = undefined
        }
        return result
      } catch (error) {
        if (runtime) { await runtime.drain(); await runtime.close(); runtime = undefined }
        return Response.json({ error: error.message }, { status: error instanceof LimitError ? 422 : 500 })
      }
    })
    requests = job.catch(() => {})
    try { return await job } finally { pending-- }
  },
}
