# Change Log

## 2.1.0

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

- Updated dependencies [[`65dc878`](https://github.com/mandel59/mojidata/commit/65dc878f67f4effdaa4a1f9a540f99767c0c5938), [`d272a29`](https://github.com/mandel59/mojidata/commit/d272a29bad0038622b704d5f045664957ea5a77a), [`679de31`](https://github.com/mandel59/mojidata/commit/679de31ef324825e0f43e9733fb90ad4c401b488)]:
  - @mandel59/mojidata-api-core@1.10.0

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
