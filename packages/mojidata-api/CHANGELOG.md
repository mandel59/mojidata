# Change Log

## 1.9.0

### Minor Changes

- [`64abc52`](https://github.com/mandel59/mojidata/commit/64abc52755604c2a939a20f98841f2e8c6437204) Thanks [@mandel59](https://github.com/mandel59)! - Release the split `mojidata-api` packages as `1.8.0`.

  This release finalizes the backend abstraction and package split work:

  - add the standalone `@mandel59/mojidata-api-core`, `-sqljs`, `-hono`, and `-runtime` packages
  - keep `@mandel59/mojidata-api` as a compatibility facade over the split packages
  - ship the `dist/`-based build outputs and compatibility subpath exports
  - add `better-sqlite3` backend support and backend-neutral test coverage

### Patch Changes

- Updated dependencies [[`64abc52`](https://github.com/mandel59/mojidata/commit/64abc52755604c2a939a20f98841f2e8c6437204)]:
  - @mandel59/mojidata-api-core@1.9.0
  - @mandel59/mojidata-api-hono@1.9.0
  - @mandel59/mojidata-api-runtime@1.9.0
  - @mandel59/mojidata-api-sqljs@1.9.0

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
