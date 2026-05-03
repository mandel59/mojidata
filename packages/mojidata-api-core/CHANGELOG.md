# Change Log

## 1.9.0

### Minor Changes

- [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e) Thanks [@mandel59](https://github.com/mandel59)! - Add `/api/v1/idsfind` property existence filters with `.has` and `.notHas`, and add dictionary/index-like Unihan property value search keys such as `unihan.kMorohashi` and `unihan.kMorohashi.glob`.

### Patch Changes

- [#38](https://github.com/mandel59/mojidata/pull/38) [`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e) Thanks [@mandel59](https://github.com/mandel59)! - Add a generated `unihan_value_ref` reverse lookup table and use it for
  `unihan_fts` queries so D1-backed `/api/v1/mojidata` requests no longer scan the
  full Unihan value table.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-04-19

### Added

- Publish the backend-neutral `mojidata-api` core as a standalone package.
- Export `SqlExecutor`, `createSqlApiDb`, IDS search helpers, and query expression utilities for adapter and app packages.

[1.8.0]: https://github.com/mandel59/mojidata/releases/tag/v1.8.0
