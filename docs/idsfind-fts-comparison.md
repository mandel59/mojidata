# idsfind FTS4 and FTS5 Comparison

This document records the repository decision for `idsfind.db` packaging and
the compatibility findings behind it.

## Decision

Keep dual support.

- `@mandel59/idsdb` remains the FTS4 package for the `sql.js` path.
- `@mandel59/idsdb-fts5` is the preferred package for native SQLite backends
  such as `better-sqlite3`, `node:sqlite`, and Cloudflare D1.
- SQLite WASM requires the FTS5 database; its runtime rejects an FTS4 IDS index with `SqliteWasmIdsfindSchemaError`.

We are not unifying on FTS5 today because the official `sql.js` build used in
this repository still does not provide FTS5 support.

## Why this is acceptable

Representative long and complex `idsfind` queries were compared against the
same source data with only the FTS backend changed.

The comparison covered:

- whole-pattern queries such as `§⿰？魚§`
- variable-constrained whole-pattern queries such as `§⿱x⿰xx§`
- multiplicity queries such as `耳*3`
- mixed queries that combine whole patterns, fragments, and multiplicity

For the selected comparison set:

- final result sets matched between FTS4 and FTS5
- result ordering also matched
- no user-visible behavior difference was found in the tested cases

## Latest measured comparison (2026-09-17)

The Unicode 18 release candidate `d945ba09` was measured on Node.js v24.13.0, linux-x64 / WSL2, Ryzen 7 3700X, with 30 measured iterations and five warmups. All eight tested queries returned identical result sets and ordering between FTS4 and FTS5.

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

FTS5 is 65,536 bytes smaller (-0.21%) in this build. The older Wiki size increase is a historical result, not the size of these artifacts. [Raw FTS results](benchmarks/2026-09-17/fts.json).
See the [complete report and raw samples](benchmarks/2026-09-17/README.md) for input fingerprints, measurement definitions, and limitations. The [previous recorded comparison](idsfind-fts-comparison-archive.md) remains available as historical evidence. Its values and the April Wiki values are separate recorded runs; neither is a matched before/after baseline for this release candidate.

## Reproducing the comparison

Prepare the benchmark dependencies:

```sh
yarn mojidata-api:bench:prepare
```

Run the `idsfind` FTS comparison harness:

```sh
node ./packages/mojidata-api-bench/benchmarks/compare-idsfind-fts.mjs
```

Save the machine-readable report:

```sh
node ./packages/mojidata-api-bench/benchmarks/compare-idsfind-fts.mjs \
  --output artifacts/bench/idsfind-fts.json
```

The harness lives in the private workspace
[`packages/mojidata-api-bench`](../packages/mojidata-api-bench) and compares the
FTS4 and FTS5 `idsfind.db` artifacts through the native `better-sqlite3` API
path.

## Related

- [Issue #18](https://github.com/mandel59/mojidata/issues/18)
- [packages/idsdb](../packages/idsdb)
- [packages/idsdb-fts5](../packages/idsdb-fts5)
