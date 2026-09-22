import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSqlApiDb } from '@mandel59/mojidata-api-core'
import { createApp } from '@mandel59/mojidata-api-hono'
import { startWorker } from './harness.mjs'
import { Budget } from './src/range-store.mjs'

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index < 0 ? fallback : process.argv[index + 1]
}
const sourcePaths = [option('mojidata-db'), option('idsfind-db')]
if (sourcePaths.some(p => !p)) throw new Error('Pass --mojidata-db <moji.db> --idsfind-db <FTS5 idsfind.db>')
const blockSizes = option('blocks', '65536').split(',').map(Number)
const sources = await Promise.all(sourcePaths.map(async file => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return { size: (await stat(file)).size, sha256: hash.digest('hex') }
}))
const files = Object.fromEntries(sources.map((source, i) => [i ? '/idsfind.db' : '/moji.db', {
  key: `releases/${source.sha256}/${i ? 'idsfind.db' : 'moji.db'}`, size: source.size,
}]))
function url(endpoint, params) {
  const u = new URL(`/api/v1/${endpoint}`, 'http://localhost')
  for (const [key, values] of Object.entries(params)) for (const value of [values].flat()) u.searchParams.append(key, value)
  return u.href
}
const cases = [
  ['details-selected', url('mojidata', { char: '弁', select: ['unihan_variant', 'unihan_variant_inverse'] })],
  ['details-full', url('mojidata', { char: '漢' })],
  ['variant-graph', url('mojidata-variants', { char: '弁' })],
  ['japanese-property', url('idsfind', { p: 'unihan.kJapaneseNewVariant', q: 'U+5F01' })],
  ['ids-whole', url('idsfind', { whole: '漢' })],
  ['ids-search', url('idsfind', { ids: '⿰木木' })],
  ['no-hit', url('idsfind', { p: 'UCS', q: '10FFFF' })],
  ['broad-property', url('idsfind', { p: 'unihan.kJapaneseOldVariant.has', q: '', all_results: '' })],
]
const nativeHandles = sourcePaths.map(p => new DatabaseSync(p, { readOnly: true }))
const executors = nativeHandles.map(db => ({
  async query(sql, params) { const stmt = db.prepare(sql); return params ? (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) : stmt.all() },
  async queryOne(sql, params) { const stmt = db.prepare(sql); return params ? (Array.isArray(params) ? stmt.get(...params) : stmt.get(params)) ?? null : stmt.get() ?? null },
}))
const baseline = createApp(createSqlApiDb({ getMojidataDb: async () => executors[0], getIdsfindDb: async () => executors[1] }))
const expected = new Map()
for (const [name, requestUrl] of cases) {
  const response = await baseline.fetch(new Request(requestUrl))
  assert.equal(response.status, 200, `native baseline ${name}`)
  expected.set(name, await response.json())
}
const persist = await mkdtemp(path.join(tmpdir(), 'mojidata-r2-bench-'))
const records = []
try {
  let first = true
  for (const blockSize of blockSizes) {
    for (const [name, requestUrl] of cases) {
      const mf = await startWorker({ files, cache: { blockSize, cacheBytes: 4 * 1024 * 1024 }, persist })
      try {
        if (first) {
          const bucket = await mf.getR2Bucket('DB')
          for (let i = 0; i < sourcePaths.length; i++) {
            await bucket.put(Object.values(files)[i].key, await readFile(sourcePaths[i]))
          }
          first = false
        }
        for (const temperature of ['cold', 'warm']) {
          const started = performance.now()
          const response = await mf.dispatchFetch(requestUrl)
          const body = await response.json()
          const wallMs = Math.round(performance.now() - started)
          const metrics = JSON.parse(response.headers.get('x-experiment-metrics') ?? '{}')
          let equivalent = false
          if (response.ok) {
            assert.deepEqual(body, expected.get(name), `equivalence: ${name} ${temperature}`)
            equivalent = true
          } else assert.equal(response.status, 422, `${name}: unexpected failure ${JSON.stringify(body)}`)
          const record = { name, temperature, blockSize, status: response.status, equivalent, wallMs, ...metrics,
            ...(response.ok ? {} : { error: body.error }) }
          records.push(record)
          console.log(JSON.stringify(record))
          if (!response.ok) break // a bounded failure has no meaningful warm run
        }
      } finally { await mf.dispose() }
    }
  }
} finally {
  nativeHandles.forEach(db => db.close())
  await rm(persist, { recursive: true, force: true })
}
const report = { generatedAt: new Date().toISOString(), environment: 'local Miniflare/workerd with emulated R2; not remote latency or billed CPU',
  node: process.version, requests: cases.map(([name, url]) => ({ name, url })),
  limits: new Budget().limits, sources, cacheBytes: 4 * 1024 * 1024, records }
const output = option('output')
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n')
