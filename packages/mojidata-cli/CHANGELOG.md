# Change Log

## 1.7.1

### Patch Changes

- [#38](https://github.com/mandel59/mojidata/pull/38) [`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e) Thanks [@mandel59](https://github.com/mandel59)! - Add a generated `unihan_value_ref` reverse lookup table and use it for
  `unihan_fts` queries so D1-backed `/api/v1/mojidata` requests no longer scan the
  full Unihan value table.
- Updated dependencies []:
  - @mandel59/mojidata-api-sqljs@1.8.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.7.0] - 2026-01-25

### Changed

- Switch DB access to `@mandel59/mojidata-api` (sql.js), removing `better-sqlite3` dependency.

[1.7.0]: https://github.com/mandel59/mojidata/compare/v1.6.2...v1.7.0
