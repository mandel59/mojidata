# @mandel59/mojidata-api-better-sqlite3

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
