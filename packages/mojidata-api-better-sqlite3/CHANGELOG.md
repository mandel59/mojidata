# @mandel59/mojidata-api-better-sqlite3

## 1.10.0

### Minor Changes

- [`679de31`](https://github.com/mandel59/mojidata/commit/679de31ef324825e0f43e9733fb90ad4c401b488) Thanks [@mandel59](https://github.com/mandel59)! - Integrate IDS search improvements with 4 KiB database pages, cycle detection
  before recursive decomposition, optional candidate providers, and versioned
  query semantics shared by database builders and API backends. Existing
  databases retain legacy query behavior; strict registered semantics and
  experimental query plans require explicit opt-in.

  Invalidate derived database caches after recipe builds or failed builds and
  when builder libraries change. Fix source-cache pruning when several resource
  links share one download. Unicode input pins and deployed D1 bindings are
  unchanged by this integration.

### Patch Changes

- Updated dependencies [[`65dc878`](https://github.com/mandel59/mojidata/commit/65dc878f67f4effdaa4a1f9a540f99767c0c5938), [`d272a29`](https://github.com/mandel59/mojidata/commit/d272a29bad0038622b704d5f045664957ea5a77a), [`1917b8b`](https://github.com/mandel59/mojidata/commit/1917b8bb56a852af275d0fe2c2ba6dd1356b8a73), [`679de31`](https://github.com/mandel59/mojidata/commit/679de31ef324825e0f43e9733fb90ad4c401b488), [`6581b2d`](https://github.com/mandel59/mojidata/commit/6581b2d4b78db8c520f4a66cf3873e53f7a8475c)]:
  - @mandel59/mojidata-api-core@1.10.0
  - @mandel59/mojidata@1.9.0
  - @mandel59/idsdb-fts5@1.10.0

## 1.9.0

### Minor Changes

- [`efd9a85`](https://github.com/mandel59/mojidata/commit/efd9a8589d7711043b83524c9b6bad7bd895068a) Thanks [@mandel59](https://github.com/mandel59)! - Publish the neutral `@mandel59/idsdb-fts5` package and make the
  `better-sqlite3` and `node:sqlite` mojidata-api backends prefer the FTS5
  `idsfind.db` build by default.

- [`c121956`](https://github.com/mandel59/mojidata/commit/c12195685a8dcae6f2f5c15ee6a08dc866e20f77) Thanks [@mandel59](https://github.com/mandel59)! - Move the native Node.js backends out of the portable `mojidata-api` runtime and
  compatibility facade.

  `@mandel59/mojidata-api` and `@mandel59/mojidata-api-runtime` now keep the
  default `sql.js` path only, while the native backends are published as the new
  explicit packages `@mandel59/mojidata-api-better-sqlite3` and
  `@mandel59/mojidata-api-node-sqlite`.

### Patch Changes

- Updated dependencies [[`efd9a85`](https://github.com/mandel59/mojidata/commit/efd9a8589d7711043b83524c9b6bad7bd895068a), [`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e), [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e), [`ce35942`](https://github.com/mandel59/mojidata/commit/ce359424defe3d78b263c655a5461b5c8a2e75ea)]:
  - @mandel59/idsdb-fts5@1.9.0
  - @mandel59/mojidata@1.8.0
  - @mandel59/mojidata-api-core@1.9.0
  - @mandel59/mojidata-api-hono@1.8.1
