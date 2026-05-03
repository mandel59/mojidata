# Change Log

## 1.9.0

### Minor Changes

- [#24](https://github.com/mandel59/mojidata/pull/24) [`30b6de0`](https://github.com/mandel59/mojidata/commit/30b6de0de5f7a38aeb0895c98c6b48299b15c6da) Thanks [@mandel59](https://github.com/mandel59)! - Add the initial SQLite wasm OPFS backend package for `mojidata-api`, including
  an OO1 `SqlExecutor` adapter, OPFS SAH pool materialization helpers, and a
  browser worker entrypoint.

- [#39](https://github.com/mandel59/mojidata/pull/39) [`9e5fa3a`](https://github.com/mandel59/mojidata/commit/9e5fa3a8e481507dd6202c93a3c1286d93a2cc75) Thanks [@mandel59](https://github.com/mandel59)! - Add documented bundler-safe mojidata-api entrypoints, public runtime/sqlite-wasm
  subpath exports, static entrypoint smoke tests, and sqlite-wasm idsfind FTS5
  schema validation.

### Patch Changes

- Updated dependencies [[`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e), [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e), [`c121956`](https://github.com/mandel59/mojidata/commit/c12195685a8dcae6f2f5c15ee6a08dc866e20f77), [`30b6de0`](https://github.com/mandel59/mojidata/commit/30b6de0de5f7a38aeb0895c98c6b48299b15c6da), [`9e5fa3a`](https://github.com/mandel59/mojidata/commit/9e5fa3a8e481507dd6202c93a3c1286d93a2cc75)]:
  - @mandel59/mojidata-api-core@1.9.0
  - @mandel59/mojidata-api-runtime@2.0.0

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-05-03

### Added

- Publish the initial SQLite wasm OPFS backend package for `mojidata-api`.
- Add a `SqlExecutor` adapter for the SQLite wasm OO1 API.
- Add `opfs-sahpool` initialization, asset import, manifest, and worker entrypoint helpers.

[1.8.0]: https://github.com/mandel59/mojidata/releases/tag/v1.8.0
