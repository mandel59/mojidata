import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Budget, LimitError, RangeStore } from '../src/range-store.mjs'

function fixture(size = 12289) {
  const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251)
  const calls = []
  const bucket = {
    async head() { return { size, etag: 'v1' } },
    async get(key, options) {
      calls.push(options)
      const { offset, length } = options.range
      const part = bytes.slice(offset, offset + length)
      return { etag: 'v1', range: { offset, length }, body: true, async arrayBuffer() { return part.buffer } }
    },
  }
  return { bytes, bucket, calls }
}

test('cross-block reads, EOF zero fill and LRU remain bounded', async () => {
  const { bytes, bucket, calls } = fixture()
  const store = new RangeStore(bucket, { blockSize: 4096, cacheBytes: 8192 })
  const file = await store.open('release/db', bytes.length)
  const result = new Uint8Array(6000)
  assert.equal(await store.read(file, result, 4000), true)
  assert.deepEqual(result, bytes.slice(4000, 10000))
  assert.equal(calls.length, 3)
  assert.ok(store.cacheBytes <= 8192)
  await store.read(file, new Uint8Array(20), 9000)
  assert.equal(calls.length, 3, 'last block should be cached')
  const tail = new Uint8Array(10).fill(255)
  assert.equal(await store.read(file, tail, bytes.length - 2), false)
  assert.deepEqual(tail, new Uint8Array([bytes.at(-2), bytes.at(-1), 0, 0, 0, 0, 0, 0, 0, 0]))
  assert.equal(await store.read(file, tail, bytes.length + 10), false)
  assert.ok(tail.every(b => b === 0))
  assert.ok(calls.every(c => c.onlyIf.etagMatches === 'v1'))
})

test('enforces budgets before issuing reads and permits cache hits without new I/O', async () => {
  const { bucket, calls, bytes } = fixture()
  const store = new RangeStore(bucket, { blockSize: 4096, cacheBytes: 8192 })
  store.budget = new Budget({ operations: 2, bytes: 4096 })
  const file = await store.open('db', bytes.length)
  await store.read(file, new Uint8Array(20), 0)
  await store.read(file, new Uint8Array(20), 1)
  await assert.rejects(store.read(file, new Uint8Array(20), 4096), LimitError)
  assert.equal(calls.length, 1)
  store.budget = new Budget({ bytes: 10 })
  await assert.rejects(store.read(file, new Uint8Array(20), 4096), /bytes budget/)
  assert.equal(calls.length, 1)
})

test('rejects missing, replaced, oversized and truncated range responses', async () => {
  const { bucket, bytes } = fixture()
  const store = new RangeStore(bucket)
  await assert.rejects(store.open('db', 1), /wrong-size/)
  const file = await store.open('db', bytes.length)
  bucket.get = async () => ({ etag: 'v2', body: true })
  await assert.rejects(store.read(file, new Uint8Array(20), 0), /changed/)
  bucket.get = async () => ({ etag: 'v1', body: true, range: { offset: 0, length: bytes.length + 1 } })
  await assert.rejects(store.read(file, new Uint8Array(20), 0), /range response/)
  bucket.get = async () => ({ etag: 'v1', body: true, range: { offset: 0, length: bytes.length }, arrayBuffer: async () => new ArrayBuffer(1) })
  await assert.rejects(store.read(file, new Uint8Array(20), 0), /short R2/)
  assert.equal(store.cacheBytes, 0)
})
