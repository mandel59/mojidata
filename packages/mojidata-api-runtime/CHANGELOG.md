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

- [#39](https://github.com/mandel59/mojidata/pull/39) [`9e5fa3a`](https://github.com/mandel59/mojidata/commit/9e5fa3a8e481507dd6202c93a3c1286d93a2cc75) Thanks [@mandel59](https://github.com/mandel59)! - Add documented bundler-safe mojidata-api entrypoints, public runtime/sqlite-wasm
  subpath exports, static entrypoint smoke tests, and sqlite-wasm idsfind FTS5
  schema validation.

### Patch Changes

- [#24](https://github.com/mandel59/mojidata/pull/24) [`30b6de0`](https://github.com/mandel59/mojidata/commit/30b6de0de5f7a38aeb0895c98c6b48299b15c6da) Thanks [@mandel59](https://github.com/mandel59)! - Add the initial SQLite wasm OPFS backend package for `mojidata-api`, including
  an OO1 `SqlExecutor` adapter, OPFS SAH pool materialization helpers, and a
  browser worker entrypoint.
- Updated dependencies [[`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e), [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e)]:
  - @mandel59/mojidata-api-core@1.9.0

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-04-19

### Added

- Publish the runtime helper package for `mojidata-api`.
- Export Node/browser runtime entry points, worker client and protocol helpers, and the optional `better-sqlite3` backend wiring.

[1.8.0]: https://github.com/mandel59/mojidata/releases/tag/v1.8.0
