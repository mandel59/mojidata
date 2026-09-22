# Read-only R2 / SQLite Wasm experiment

Tracks [#73](https://github.com/mandel59/mojidata/issues/73). This is a private,
standalone npm experiment, outside the production Yarn workspaces. It is not a
production replacement or a published backend. There is no deployment command,
Wrangler configuration, D1 binding, Cloudflare credential requirement, or remote
benchmark mode. Production Workers and databases are unchanged.

## Run locally

Use Node.js 24 (the baseline and fixtures use `node:sqlite`):

```sh
cd 'experiments/mojidata-api-r2'
npm ci --ignore-scripts --workspaces=false
npm test
npm run bench -- \
  --mojidata-db '/path/to/published/mojidata/dist/moji.db' \
  --idsfind-db '/path/to/published/idsdb-fts5/idsfind.db' \
  --blocks '16384,65536,262144' \
  --output '/tmp/mojidata-r2-results.json'
```

Tests create tiny local SQLite fixtures. Benchmarks require explicit verified DB
paths; they fingerprint the files and copy them into a temporary **local** R2
emulator. Each case starts a fresh workerd isolate for its cold request, followed
by the same request against the warm isolate. The SQLite native baseline uses
the identical API core, Hono handlers and DB files. Every successful response is
compared deeply with the baseline. Bounded failures are recorded, not reported
as successful equivalence checks. A failed cold request has no warm sample.

The harness uses Miniflare 5's explicit v4 option converter and explicit local
persistence paths. A narrow esbuild resolver uses this directory's npm modules,
not the parent repository's Yarn PnP map. No parent dependencies are modified.

## Implementation

`src/worker.mjs` composes the published `createSqlApiDb` and Hono `createApp` with
a new asynchronous SQL executor. `src/r2-vfs.mjs` is a read-only SQLite VFS;
`src/range-store.mjs` reads aligned blocks with `R2Bucket.get({ range })` and
keeps one bounded LRU shared across both databases. SQLite also keeps its own
2 MiB page cache per database. Both are separate from any API response cache;
this experiment has no response cache.

The npm alias `wa-sqlite` pins **@journeyapps/wa-sqlite 2.0.4** (PowerSync's MIT
fork), not the original wa-sqlite 1.0.0. The latter's published build lacks FTS5.
The selected Asyncify build runs SQLite 3.53.0 with FTS5. Wasm is statically
provided as a CompiledWasm module, not downloaded and compiled during a request.

A file's size is checked on open and its ETag is pinned. Every range GET uses
`etagMatches`; wrong versions, missing bodies, mismatched ranges and short
responses fail closed. The benchmark keys include the source SHA-256. A real
release would need independently verified immutable R2 keys and a trusted
manifest; the VFS does not download whole files to verify their SHA-256.
Whole-file Brotli/gzip assets cannot serve these byte offsets; use raw SQLite.

Requests are serialized per isolate (at most four running/queued requests).
SQL calls are also serialized because Asyncify cannot interleave calls into
one Wasm instance, while core has legitimate `Promise.all` paths. Outstanding
SQL siblings are drained before the next request starts. On error, connections
and their caches are discarded.

Default per-request bounds:

- 512 R2 operations, including HEAD; 32 MiB requested range bytes.
- 10 million SQLite VM instructions, checked in intervals of 1,000.
- 256 SQL queries and 20,000 returned SQL rows (not API result count).
- 15 seconds checked at budget checkpoints; this is **not** hard CPU preemption.
- 4 MiB SQLite value limit, 128 KiB SQL text limit, 2,048-character URL limit.
- 4 MiB shared range cache; default blocks are 64 KiB.

Limits return HTTP 422. Unsupported writes return 405; the VFS also rejects
writes/truncation/deletion and SQLite uses read-only/query-only connections.
This is a prototype admission policy, not a production API compatibility promise.
The VM limit does not bound all JavaScript exact-matching work, and neither the
reported Wasm heap nor cache sizes measure total isolate memory. Production
needs CPU limits, total-memory measurement, cancellation and concurrency/load
validation in addition to these guards.

## Evidence and next steps

See [the experiment report](../../docs/experiments/2026-09-22-r2-wasm/README.md)
for the full recorded workload, source hashes, results and limitations.

The benchmarks measure local wall-clock time and emulated R2 reads, **not**
network R2 latency or billed Workers CPU. Source DB files total approximately
128 MiB, but only ranges are read by the application Worker. The Node controller
loads files when seeding local R2; its memory is not the Worker's memory.

Before considering a remote trial: reduce cold range fan-out and read
amplification, review the unindexed SQLite views, choose an affordable workload
budget, check current Workers CPU/subrequest limits, and provision an isolated
experimental Worker. Do not deploy this to the existing API or reuse D1 for
benchmark comparison. No billing plan change is part of this experiment.

Sources: [wa-sqlite fork](https://github.com/powersync-ja/wa-sqlite),
[R2 ranged reads](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#ranged-reads),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
