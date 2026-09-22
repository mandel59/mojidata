import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { startWorker } from '../harness.mjs'

const requestUrl = 'http://localhost/api/v1/mojidata?char=弁&select=unihan_variant&select=unihan_variant_inverse'
async function setup(t, limits) {
  const temp = await mkdtemp(path.join(tmpdir(), 'mojidata-r2-test-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const dbPath = path.join(temp, 'fixture.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`CREATE TABLE unihan_variant(UCS TEXT, property TEXT, value TEXT, additional_data TEXT);
    INSERT INTO unihan_variant VALUES ('弁','kJapaneseOldVariant','瓣',NULL),('瓣','kJapaneseNewVariant','弁',NULL);
    CREATE VIRTUAL TABLE fts USING fts5(value);
    INSERT INTO fts VALUES ('FTS5 smoke');`)
  db.close()
  const bytes = await readFile(dbPath)
  const files = Object.fromEntries(['/moji.db', '/idsfind.db'].map(name => [name, { key: `release${name}`, size: bytes.length }]))
  const mf = await startWorker({ files, limits })
  t.after(() => mf.dispose())
  const bucket = await mf.getR2Bucket('DB')
  for (const spec of Object.values(files)) await bucket.put(spec.key, bytes)
  return mf
}

test('workerd serves real SQLite rows over local R2 range reads and reuses caches', async t => {
  const mf = await setup(t)
  const cold = await mf.dispatchFetch(requestUrl)
  assert.equal(cold.status, 200, await cold.clone().text())
  const body = await cold.json()
  assert.deepEqual(body.results.unihan_variant, [['kJapaneseOldVariant', 'U+74E3', '瓣']])
  assert.deepEqual(body.results.unihan_variant_inverse, [['kJapaneseNewVariant', 'U+74E3', '瓣']])
  const metrics = JSON.parse(cold.headers.get('x-experiment-metrics'))
  assert.ok(metrics.gets > 0)
  assert.ok(metrics.wasmHeapBytes < 32 * 1024 * 1024)
  const responses = await Promise.all([mf.dispatchFetch(requestUrl), mf.dispatchFetch(requestUrl)])
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), body)
    assert.equal(JSON.parse(response.headers.get('x-experiment-metrics')).gets, 0)
  }
  assert.equal((await mf.dispatchFetch(requestUrl, { method: 'POST' })).status, 405)
})

test('workerd fails closed when the range budget is exhausted, and can retry cleanly', async t => {
  const mf = await setup(t, { operations: 2, bytes: 0 })
  for (let i = 0; i < 2; i++) {
    const response = await mf.dispatchFetch(requestUrl)
    assert.equal(response.status, 422, await response.clone().text())
    assert.match((await response.json()).error, /budget exceeded/)
  }
})

test('workerd interrupts expensive SQL with a VM instruction budget', async () => {
  // Make an indexed-size-independent full-scan fixture without changing the API.
  // SQL work is tested through the public API, not a raw SQL endpoint.
  const temp = await mkdtemp(path.join(tmpdir(), 'mojidata-r2-vm-'))
  try {
    const filename = path.join(temp, 'db')
    const db = new DatabaseSync(filename)
    db.exec(`CREATE TABLE unihan_variant(UCS TEXT, property TEXT, value TEXT, additional_data TEXT);
      WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000)
      INSERT INTO unihan_variant SELECT '弁','kJapaneseOldVariant','瓣',NULL FROM n;`)
    db.close()
    // Use a fresh worker with the correct fingerprint/size metadata.
    const bytes = await readFile(filename)
    const fresh = await startWorker({ files: Object.fromEntries(['/moji.db', '/idsfind.db'].map(name => [name, { key: name, size: bytes.length }])), limits: { vmSteps: 0 } })
    try {
      const b = await fresh.getR2Bucket('DB')
      for (const key of ['/moji.db', '/idsfind.db']) await b.put(key, bytes)
      const response = await fresh.dispatchFetch(requestUrl)
      assert.equal(response.status, 422, await response.clone().text())
      assert.match((await response.json()).error, /vmSteps budget exceeded/)
    } finally { await fresh.dispose() }
  } finally { await rm(temp, { recursive: true, force: true }) }
})
