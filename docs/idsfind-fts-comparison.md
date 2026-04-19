# idsfind FTS4 and FTS5 Comparison

This document records the repository decision for `idsfind.db` packaging and
the compatibility findings behind it.

## Decision

Keep dual support.

- `@mandel59/idsdb` remains the FTS4 package for the `sql.js` path.
- `@mandel59/idsdb-fts5` is the preferred package for native SQLite backends
  such as `better-sqlite3`, `node:sqlite`, and Cloudflare D1.

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

## Performance summary

The native `better-sqlite3` comparison showed that FTS5 is often materially
faster on selective queries.

| Query | Final hits | FTS candidates | FTS4 avg | FTS5 avg | FTS5 vs FTS4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `["§⿰？魚§"]` | 35 | 55 | 61.10 ms | 17.75 ms | -70.95% |
| `["§⿰？魚§", "火"]` | 35 | 55 | 70.16 ms | 18.41 ms | -73.76% |
| `["§⿱x⿰xx§"]` | 161 | 20638 | 588.19 ms | 599.52 ms | +1.93% |
| `["§⿱x⿰xx§", "口"]` | 18 | 4862 | 155.66 ms | 151.10 ms | -2.93% |
| `["§⿱x⿰xx§", "木"]` | 6 | 2570 | 111.43 ms | 88.71 ms | -20.38% |
| `["耳*3"]` | 51 | 1372 | 71.32 ms | 63.87 ms | -10.44% |
| `["木", "耳*3"]` | 4 | 89 | 34.47 ms | 12.21 ms | -64.57% |
| `["§⿱艹⿰日月§", "日", "月"]` | 1 | 1 | 89.76 ms | 24.48 ms | -72.72% |

The broad variable query `§⿱x⿰xx§` is the main exception: its candidate set
is so large that post-audit dominates total runtime, so FTS5 does not improve
end-to-end time there.

## Size difference

For the compared generated databases:

- FTS4 `idsfind.db`: `32,757,760 bytes`
- FTS5 `idsfind.db`: `32,993,280 bytes`

That is an increase of `235,520 bytes` (`+0.72%`).

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
