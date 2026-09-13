---
"@mandel59/mojidata": patch
"@mandel59/idsdb": minor
"@mandel59/idsdb-fts5": minor
"@mandel59/idsdb-bvec": minor
"@mandel59/idsdb-utils": minor
"@mandel59/mojidata-api-core": minor
"@mandel59/mojidata-api-better-sqlite3": minor
"@mandel59/mojidata-api-node-sqlite": minor
"@mandel59/mojidata-api-runtime": minor
"@mandel59/mojidata-api-sqljs": minor
"@mandel59/mojidata-api-sqlite-wasm": minor
"@mandel59/mojidata-api-d1": minor
---

Integrate IDS search improvements with 4 KiB database pages, cycle detection
before recursive decomposition, optional candidate providers, and versioned
query semantics shared by database builders and API backends. Existing
databases retain legacy query behavior; strict registered semantics and
experimental query plans require explicit opt-in.

Invalidate derived database caches after recipe builds or failed builds and
when builder libraries change. Fix source-cache pruning when several resource
links share one download. Unicode input pins and deployed D1 bindings are
unchanged by this integration.
