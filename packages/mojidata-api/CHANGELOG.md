# Change Log

## 2.0.0

### Major Changes

- [`c121956`](https://github.com/mandel59/mojidata/commit/c12195685a8dcae6f2f5c15ee6a08dc866e20f77) Thanks [@mandel59](https://github.com/mandel59)! - Move the native Node.js backends out of the portable `mojidata-api` runtime and
  compatibility facade.

  `@mandel59/mojidata-api` and `@mandel59/mojidata-api-runtime` now keep the
  default `sql.js` path only, while the native backends are published as the new
  explicit packages `@mandel59/mojidata-api-better-sqlite3` and
  `@mandel59/mojidata-api-node-sqlite`.

### Minor Changes

- [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e) Thanks [@mandel59](https://github.com/mandel59)! - Add `/api/v1/idsfind` property existence filters with `.has` and `.notHas`, and add dictionary/index-like Unihan property value search keys such as `unihan.kMorohashi` and `unihan.kMorohashi.glob`.

- [#39](https://github.com/mandel59/mojidata/pull/39) [`9e5fa3a`](https://github.com/mandel59/mojidata/commit/9e5fa3a8e481507dd6202c93a3c1286d93a2cc75) Thanks [@mandel59](https://github.com/mandel59)! - Add documented bundler-safe mojidata-api entrypoints, public runtime/sqlite-wasm
  subpath exports, static entrypoint smoke tests, and sqlite-wasm idsfind FTS5
  schema validation.

### Patch Changes

- [#38](https://github.com/mandel59/mojidata/pull/38) [`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e) Thanks [@mandel59](https://github.com/mandel59)! - Add a generated `unihan_value_ref` reverse lookup table and use it for
  `unihan_fts` queries so D1-backed `/api/v1/mojidata` requests no longer scan the
  full Unihan value table.

- [#38](https://github.com/mandel59/mojidata/pull/38) [`ce35942`](https://github.com/mandel59/mojidata/commit/ce359424defe3d78b263c655a5461b5c8a2e75ea) Thanks [@mandel59](https://github.com/mandel59)! - Add `Cache-Control: no-store` to mojidata-api JSON responses so D1 blue/green
  cutovers are not hidden by stale consumer-side caches.
- Updated dependencies [[`efd9a85`](https://github.com/mandel59/mojidata/commit/efd9a8589d7711043b83524c9b6bad7bd895068a), [`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e), [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e), [`c121956`](https://github.com/mandel59/mojidata/commit/c12195685a8dcae6f2f5c15ee6a08dc866e20f77), [`ce35942`](https://github.com/mandel59/mojidata/commit/ce359424defe3d78b263c655a5461b5c8a2e75ea), [`30b6de0`](https://github.com/mandel59/mojidata/commit/30b6de0de5f7a38aeb0895c98c6b48299b15c6da), [`9e5fa3a`](https://github.com/mandel59/mojidata/commit/9e5fa3a8e481507dd6202c93a3c1286d93a2cc75)]:
  - @mandel59/mojidata-api-better-sqlite3@1.9.0
  - @mandel59/mojidata-api-node-sqlite@1.9.0
  - @mandel59/mojidata-api-core@1.9.0
  - @mandel59/mojidata-api-runtime@2.0.0
  - @mandel59/mojidata-api-hono@1.8.1
  - @mandel59/mojidata-api-sqljs@1.8.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-04-19

### Added

- Add the standalone `@mandel59/mojidata-api-core`, `@mandel59/mojidata-api-sqljs`, `@mandel59/mojidata-api-hono`, and `@mandel59/mojidata-api-runtime` packages.
- Add a `better-sqlite3` backend option alongside the existing `sql.js` path.
- Add backend-neutral SQL API tests, sql.js adapter contract tests, and HTTP smoke tests.

### Changed

- Turn `@mandel59/mojidata-api` into a compatibility facade over the split packages while preserving existing `api/v1` and `_lib` import paths.
- Move published build outputs under `dist/` instead of committing generated JS files alongside source files.
- Add CI/CD release automation and Trusted Publishing support for the split package release flow.

## [1.7.5] - 2026-02-15

### Fixed

- Fix `ne` / `notGlob` query composition so they can be combined with other filters (e.g. via `INTERSECT`) without SQL errors.
- Expand multi-condition `/api/v1/idsfind` tests to cover mixed operator combinations and prevent regressions.

## [1.7.4] - 2026-02-15

### Added

- Add negation query suffixes for `/api/v1/idsfind` property search keys:
  - `.ne` (negation of `=`)
  - `.notGlob` (negation of `~` / `.glob`)

### Fixed

- Make `unihan.kStrange*.glob` treat `NULL` values as empty strings so categories with null-valued entries can match patterns such as `*`.

## [1.7.3] - 2026-02-15

### Fixed

- Return `400 Bad Request` (instead of `500`) for unknown `p` query keys in `/api/v1/idsfind`.

## [1.7.2] - 2026-02-15

### Added

- Extend `/api/v1/idsfind` search keys with broader Unihan property support across IRG sources, numeric values, readings, and variants.
- Add `unihan.kStrange` category search keys (`unihan.kStrange.<Category>` and `.glob`).
- Add `glob` support for `mji.読み` (`mji.読み.glob`).
- Add unit and integration tests for the new key resolution and idsfind behavior.

### Changed

- Accept `.eq` key aliases (e.g. `unihan.kTotalStrokes.eq`, `totalStrokes.eq`) and normalize them to equality semantics.
- Improve variant matching to accept both literal characters and `U+XXXX` input forms.

## [1.7.1] - 2026-01-26

### Changed

- Include `tsconfig.json` in the published package files.

## [1.7.0] - 2026-01-25

### Added

- Add API endpoints: `/api/v1/ivs-list` and `/api/v1/mojidata-variants`.
- Add IDS find debug-query support (`idsfindDebugQuery`).

### Changed

- Add `prepare` build step and publish built JS/typings for consumers.

[1.8.0]: https://github.com/mandel59/mojidata/compare/v1.7.5...v1.8.0
[1.7.5]: https://github.com/mandel59/mojidata/compare/v1.7.4...v1.7.5
[1.7.4]: https://github.com/mandel59/mojidata/compare/v1.7.3...v1.7.4
[1.7.3]: https://github.com/mandel59/mojidata/compare/v1.7.2...v1.7.3
[1.7.2]: https://github.com/mandel59/mojidata/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/mandel59/mojidata/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/mandel59/mojidata/compare/v1.6.3...v1.7.0
