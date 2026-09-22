# R2-backed SQLite Wasm experiment — 2026-09-22

Issue: [#73](https://github.com/mandel59/mojidata/issues/73).
Implementation and reproduction: [standalone experiment](../../../experiments/mojidata-api-r2/README.md).
Raw evidence: [benchmarks.json](benchmarks.json).

## Outcome

SQLite Wasm with a read-only asynchronous R2 VFS runs in **local workerd**.
The existing published API core and Hono routes work without D1. All 36 successful
cold/warm responses matched native SQLite exactly. Six other requests stopped
at explicit range-operation or byte limits; these are failures, not equivalent
successful results. Six unit/integration tests passed.

This is a feasibility result, not a production recommendation. No Worker was
remotely deployed, no R2 object was remotely read or written, and no D1 operation
was executed. The experiment does not resolve the existing production incident.

## Inputs and procedure

- `@mandel59/mojidata-api-core` 1.10.2; API Hono 1.8.1.
- `wa-sqlite` npm alias for `@journeyapps/wa-sqlite` 2.0.4: SQLite 3.53.0,
  Asyncify, FTS5. Original wa-sqlite 1.0.0 was tried but lacks FTS5.
- Miniflare 5.20260921.0-alpha, local workerd and local R2 emulator.
- Published Mojidata 1.9.1 DB: 102,735,872 bytes (97.98 MiB), SHA-256
  `c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b`.
- Published idsdb-fts5 1.10.0 DB: 31,440,896 bytes (29.98 MiB), SHA-256
  `d8df4edde88187c8389861acf4c055b3fd3d94bc11c4a21ffe5a168964bda47c`.
- Both databases have 4,096-byte pages. No data transformations were applied.
- Eight cases, three block sizes (16/64/256 KiB), one cold and one warm request
  per successful case. Each cold case uses a fresh isolate, reusing the local
  immutable R2 objects. The failed cold cases skip their warm run: 42 total
  requests, 36 successful/equivalent, six HTTP 422 bounded failures.
- Native `node:sqlite` reads exactly the same files through the same API core
  and Hono handlers. Deep comparison covers the full JSON responses.
- Every request is bounded: 512 HEAD/GET operations, 32 MiB requested range
  bytes, 10 million SQLite VM instructions, 256 SQL queries, 20,000 SQL result
  rows, plus elapsed-time checkpoints. No remote budget is consumed.

## Representative 64 KiB block results

Shared range-cache capacity: 4 MiB; SQLite cache: 2 MiB per DB. There is no API
response cache. Milliseconds below are measured by the Node controller,
including local dispatch and response-body reading. Cold includes startup.
These numbers are **not remote R2 latency or Workers CPU billing measurements**.

| Request | Cold / warm ms | Cold / warm range GETs | Cold / warm MiB fetched |
| --- | ---: | ---: | ---: |
| 弁 selected forward/reverse Unihan variants | 714 / 340 | 42 / 0 | 2.60 / 0 |
| 漢 full character details | 1,487 / 970 | 373 / 341 | 23.29 / 21.31 |
| 弁 transitive variant graph | 550 / 36 | 208 / 0 | 12.98 / 0 |
| `kJapaneseNewVariant=U+5F01` | 374 / 19 | 22 / 0 | 1.35 / 0 |
| IDS whole-character search 漢 | 537 / 195 | 113 / 75 | 7.04 / 4.69 |
| IDS component search ⿰木木 | 1,153 / — | 510 / — | 31.85 / — |
| No-hit UCS 10FFFF | 298 / 4 | 21 / 0 | 1.29 / 0 |
| `kJapaneseOldVariant.has` (362 results) | 358 / 12 | 22 / 0 | 1.35 / 0 |

The ⿰木木 request failed at 512 total R2 operations (two HEADs plus 510 GETs).
It must not be counted as a working arbitrary IDS search. Full character details
still read over 21 MiB on a repeated request with this small shared cache.

Wasm linear memory reported 17,432,576 bytes (16.625 MiB) throughout these cases;
range-cache residency never exceeded 4 MiB. SQLite's page caches are within the
Wasm heap. This does **not** measure JavaScript heaps, response buffers, total
isolate memory, or peak transient allocation. No whole-database buffer is loaded
by the application Worker; the benchmark controller seeds local R2 separately.

## Block-size comparison

- 16 KiB reduces over-fetch: whole-character IDS read 4.43 MiB cold, then zero
  GETs warm. But full details and ⿰木木 each exceed 512 operations.
- 64 KiB completes full details within the guards, but reads substantially more
  data and evicts useful blocks. ⿰木木 still exceeds 512 operations.
- 256 KiB reduces some operation counts but full details, variant graph and
  ⿰木木 hit the 32 MiB byte budget. Larger blocks alone do not solve the problem.

One run per combination is useful for feasibility and I/O counts, not for p95
latency or a production cost estimate. No claim of free-tier suitability is made.

## What should happen before deployment

1. Reduce unnecessary reads in the read-only artifact: inspect inverse Unihan
   views and materialize/index selected relations in an R2-specific derived
   snapshot, or serve precomputed character-detail JSON. Track equivalence and
   new artifact hashes. Shared SQL or builder changes would require a fresh D1
   quota impact review even if the initial benchmark is local.
2. Measure a larger yet bounded cache and more selective prefetching. Per-DB
   block sizes may work better than one large block size for both files.
3. Reduce IDS candidate/audit random reads; preserve exact matching. Keep the
   broad-query limits rather than increasing them until every query succeeds.
4. Add representative multi-user load, eviction and total-isolate-memory tests.
   Current request serialization protects Asyncify but limits throughput.
5. Only then consider a separately provisioned remote Worker with reviewed R2
   operation/byte budgets and actual CPU/subrequest limits. There is no remote
   benchmark or deployment path in this PR. Native SQLite in Containers remains
   an alternative if this work is disproportionate.

## D1 impact

Before and after: zero added D1 reads/writes. Runtime bindings include local R2
only; baseline uses local SQLite files. Production packages, SQL, DB generators,
root dependencies and existing deployment workflows are unchanged. The new CI
job runs synthetic local fixtures without Cloudflare credentials. Its D1 impact
is also zero. Account quota usage is not queried because there is no remote D1
operation to authorize or budget.
