export class LimitError extends Error {}

export class Budget {
  constructor(limits = {}) {
    this.limits = { operations: 512, bytes: 32 * 1024 * 1024, vmSteps: 10_000_000,
      queries: 256, rows: 20_000, elapsedMs: 15_000, ...limits }
    if (Object.values(this.limits).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('invalid request budget')
    this.started = Date.now()
    this.used = { operations: 0, bytes: 0, vmSteps: 0, queries: 0, rows: 0 }
  }
  charge(kind, amount = 1) {
    if (Date.now() - this.started > this.limits.elapsedMs) throw new LimitError('elapsed-time budget exceeded')
    if (this.used[kind] + amount > this.limits[kind]) throw new LimitError(`${kind} budget exceeded`)
    this.used[kind] += amount
  }
}

// One bounded LRU shared by both SQLite files; never stores a whole DB.
export class RangeStore {
  constructor(bucket, { blockSize = 64 * 1024, cacheBytes = 4 * 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(blockSize) || blockSize < 4096 || blockSize % 4096 ||
        !Number.isSafeInteger(cacheBytes) || cacheBytes < blockSize) throw new Error('invalid cache configuration')
    this.bucket = bucket
    this.blockSize = blockSize
    this.cacheLimit = cacheBytes
    this.cache = new Map()
    this.cacheBytes = 0
    this.budget = new Budget()
    this.resetMetrics()
  }
  resetMetrics() {
    this.metrics = { heads: 0, gets: 0, fetchedBytes: 0, hits: 0, misses: 0, peakCacheBytes: this.cacheBytes }
  }
  async open(key, expectedSize) {
    this.budget.charge('operations')
    this.metrics.heads++
    const object = await this.bucket.head(key)
    if (!object || object.size !== expectedSize) throw new Error(`missing or wrong-size DB: ${key}`)
    return { key, size: object.size, etag: object.etag }
  }
  async block(file, offset) {
    const key = `${file.key}:${file.etag}:${offset}`
    if (this.cache.has(key)) {
      const data = this.cache.get(key)
      this.cache.delete(key)
      this.cache.set(key, data)
      this.metrics.hits++
      return data
    }
    const length = Math.min(this.blockSize, file.size - offset)
    this.budget.charge('operations')
    this.budget.charge('bytes', length)
    this.metrics.misses++
    this.metrics.gets++
    const result = await this.bucket.get(file.key, {
      range: { offset, length }, onlyIf: { etagMatches: file.etag },
    })
    if (!result?.body || result.etag !== file.etag) throw new Error('DB changed or disappeared during read')
    // Do not accept a server returning the whole file for a range request.
    if (result.range?.offset !== offset || result.range?.length !== length) throw new Error('invalid R2 range response')
    const data = new Uint8Array(await result.arrayBuffer())
    if (data.length !== length) throw new Error('short R2 range response')
    this.metrics.fetchedBytes += data.length
    while (this.cacheBytes + data.length > this.cacheLimit) {
      const oldest = this.cache.keys().next().value
      this.cacheBytes -= this.cache.get(oldest).length
      this.cache.delete(oldest)
    }
    this.cache.set(key, data)
    this.cacheBytes += data.length
    this.metrics.peakCacheBytes = Math.max(this.metrics.peakCacheBytes, this.cacheBytes)
    return data
  }
  async read(file, target, offset) {
    target.fill(0)
    const available = Math.max(0, Math.min(target.length, file.size - offset))
    let copied = 0
    while (copied < available) {
      const pos = offset + copied
      const start = Math.floor(pos / this.blockSize) * this.blockSize
      const data = await this.block(file, start)
      const count = Math.min(available - copied, data.length - (pos - start))
      target.set(data.subarray(pos - start, pos - start + count), copied)
      copied += count
    }
    return copied === target.length
  }
}
