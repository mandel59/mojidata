# @mandel59/idsdb-fts5

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

## 1.9.0

### Minor Changes

- [`efd9a85`](https://github.com/mandel59/mojidata/commit/efd9a8589d7711043b83524c9b6bad7bd895068a) Thanks [@mandel59](https://github.com/mandel59)! - Publish the neutral `@mandel59/idsdb-fts5` package and make the
  `better-sqlite3` and `node:sqlite` mojidata-api backends prefer the FTS5
  `idsfind.db` build by default.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-04-19

### Added

- Publish an FTS5-oriented `idsfind.db` package for mojidata backends that support SQLite FTS5.

[1.8.0]: https://github.com/mandel59/mojidata/releases/tag/v1.8.0
