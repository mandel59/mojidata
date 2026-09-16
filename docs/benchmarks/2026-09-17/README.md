# Benchmark results — 2026-09-17

This is a release-candidate measurement, not a record of an npm release or a Unicode 18 D1 deployment. The source is `d945ba09dc3a7676d312abbbee2981bf2328bfdc`, including final Unicode 18.0 UCD and the finalized mojidata-ids path. All local runs recorded a clean working tree.

## Environment and method

- Node.js v24.13.0, linux-x64, WSL2 (`6.18.35.2-microsoft-standard-WSL2`), AMD Ryzen 7 3700X.
- Local scenario set version 1: six scenarios, 30 measured iterations, five warmups, three fresh-app samples per scenario. Backends ran sequentially: sql.js, better-sqlite3, node:sqlite; the FTS comparison ran afterward.
- The HTTP harness measures request dispatch until the Response is available. Body consumption and JSON validation happen afterward, outside the timed interval. Local calls run in process; remote calls include network latency up to response availability.
- “Cold” samples create a fresh app in the same process. They do not flush OS caches or measure a fresh Node process.
- Local HTTP runs validate successful status and parseable JSON, not cross-backend response equality. The separate FTS comparison checks both complete result sets and ordering.
- Local backends use their default IDS indexes: FTS4 for sql.js and FTS5 for native SQLite. Bloom-vector, structural providers, EIDS, Rust, and strict-semantics overhead are not measured here.
- These are one-run descriptive measurements, not confidence intervals. Do not derive speedups from the April darwin-arm64 Wiki run: hardware, data, and code differ.
- JSON timestamps use UTC (September 16, 18:04–18:08); the date above is JST (September 17).

[Input DB sizes and SHA256 digests](provenance.json), [exact scenario definitions](scenarios.json), and raw samples are committed alongside this page.

## Local API latency

Mean / p95 in milliseconds; lower is better.

| Scenario | sql.js | better-sqlite3 | node:sqlite |
| --- | ---: | ---: | ---: |
| mojidata-basic | 278.81 / 290.74 | 163.45 / 175.26 | 167.66 / 184.29 |
| mojidata-select | 79.82 / 85.96 | 45.25 / 50.34 | 51.34 / 54.03 |
| ivs-list | 0.29 / 0.41 | 0.23 / 0.33 | 0.22 / 0.26 |
| mojidata-variants | 1157.86 / 1187.18 | 638.82 / 656.39 | 735.76 / 752.42 |
| idsfind-ids | 82.22 / 84.27 | 14.04 / 14.45 | 14.43 / 15.28 |
| idsfind-property | 22.99 / 24.40 | 13.69 / 15.90 | 20.33 / 22.99 |

In this run, better-sqlite3 had the lowest average for five of six scenarios. node:sqlite was marginally lower for `ivs-list`; the sub-millisecond difference is not a general backend ranking. The variant expansion scenario remained the most expensive measured API operation.

Raw samples: [sql.js](sqljs.json), [better-sqlite3](better-sqlite3.json), [node:sqlite](node-sqlite.json). Fresh-app samples and p50/min/max are in those files.

## FTS4 versus FTS5

The same moji.db and better-sqlite3 API implementation were used, changing only the IDS index. Each case used 30 measured iterations after five warmups. All eight cases produced identical result sets and ordering. Candidate counts also matched between the indexes.

Mean latency in milliseconds. Delta is `(FTS5 / FTS4 - 1) × 100`.

| Query | Hits | Candidates | FTS4 | FTS5 | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `["§⿰？魚§"]` | 35 | 55 | 67.36 | 11.32 | -83.20% |
| `["§⿰？魚§", "火"]` | 35 | 55 | 73.58 | 11.97 | -83.73% |
| `["§⿱x⿰xx§"]` | 162 | 20575 | 190.53 | 191.62 | +0.57% |
| `["§⿱x⿰xx§", "口"]` | 18 | 4857 | 61.51 | 49.97 | -18.77% |
| `["§⿱x⿰xx§", "木"]` | 7 | 2568 | 61.01 | 36.21 | -40.65% |
| `["耳*3"]` | 51 | 1373 | 20.29 | 13.59 | -33.03% |
| `["木", "耳*3"]` | 4 | 89 | 28.04 | 5.60 | -80.02% |
| `["§⿱艹⿰日月§", "日", "月"]` | 1 | 1 | 97.40 | 17.95 | -81.57% |

FTS5 substantially reduces latency for selective whole-pattern queries. The broad `§⿱x⿰xx§` query remains approximately tied: candidate verification dominates the full call. A broad pattern therefore does not inherit the speedup of a selective pattern.

Prefilter-only mean latency (the harness counts the `results` CTE rather than running full result verification):

| Query | FTS4 ms | FTS5 ms |
| --- | ---: | ---: |
| `["§⿰？魚§"]` | 67.01 | 10.37 |
| `["§⿱x⿰xx§"]` | 29.67 | 30.49 |
| `["§⿱x⿰xx§", "口"]` | 24.31 | 13.97 |
| `["§⿱艹⿰日月§", "日", "月"]` | 97.02 | 17.34 |

Generated IDS database sizes (4096-byte pages):

| Index | Bytes |
| --- | ---: |
| FTS4 | 31,506,432 |
| FTS5 | 31,440,896 |

FTS5 is 65,536 bytes smaller (-0.21%) in this build. The older Wiki size increase is a historical result, not the size of these artifacts. [Raw FTS results](fts.json).

## Deployed D1 observation

Target: `https://mojidata-api-d1.mandel59.workers.dev`. Three scenarios, five measured requests and one warmup each (18 requests total), executed sequentially after the local benchmarks. All requests succeeded and returned parseable JSON.

This is a small client-observed latency sample. The active Worker version, source commit, Unicode data version, D1 bindings, SQL duration, and rows-read counters were not established by this HTTP run. In `d1.json`, `environment.gitRevision` identifies the **benchmark client**, not the deployed Worker. Do not interpret these numbers as a comparison against the local Unicode 18 database or as a current Free-plan capacity result. The five-sample p95 is just the largest sample.

| Scenario | Mean ms | p50 ms | Max ms |
| --- | ---: | ---: | ---: |
| mojidata-select | 43.15 | 40.63 | 54.89 |
| ivs-list | 45.04 | 43.72 | 50.48 |
| idsfind-ids | 64.16 | 61.93 | 69.10 |

[Raw D1 samples](d1.json). The historical May 3 SQL scan-volume measurements remain historical; they were not rerun with D1 administrative access.

## Reproduction

Run from the repository root at the source commit above, with its locked dependencies. Output paths are absolute because the Yarn workspace benchmark commands change the working directory. Run these commands sequentially.

```sh
corepack yarn install --immutable
corepack yarn mojidata-api:bench:prepare
corepack yarn mojidata-api:bench:local \
  --output-dir /tmp/mojidata-bench/local --iterations 30 --warmup 5 --cold 3
node packages/mojidata-api-bench/benchmarks/compare-idsfind-fts.mjs \
  --iterations 30 --warmup 5 --output /tmp/mojidata-bench/fts.json
corepack yarn mojidata-api:bench \
  --base-url https://mojidata-api-d1.mandel59.workers.dev \
  --label deployed-d1 --scenario mojidata-select --scenario ivs-list \
  --scenario idsfind-ids --iterations 5 --warmup 1 --cold 0 \
  --output /tmp/mojidata-bench/d1.json
```

A later remote rerun may target different deployed code/data even with the same URL. Record its measurement date separately.

## Wiki use

Use the local table in **Benchmark Results**, the FTS table and compatibility decision in **FTS4 vs FTS5 Comparison**, and the bounded HTTP observation in **Cloudflare D1 Deployment**. Link to this page and its raw JSON. Retain the April/May figures as dated historical runs; do not overwrite their environments with this run's metadata or treat this source commit as already published/deployed.
