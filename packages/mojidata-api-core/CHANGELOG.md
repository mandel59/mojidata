# Change Log

## 1.9.0

### Minor Changes

- [`64abc52`](https://github.com/mandel59/mojidata/commit/64abc52755604c2a939a20f98841f2e8c6437204) Thanks [@mandel59](https://github.com/mandel59)! - Release the split `mojidata-api` packages as `1.8.0`.

  This release finalizes the backend abstraction and package split work:

  - add the standalone `@mandel59/mojidata-api-core`, `-sqljs`, `-hono`, and `-runtime` packages
  - keep `@mandel59/mojidata-api` as a compatibility facade over the split packages
  - ship the `dist/`-based build outputs and compatibility subpath exports
  - add `better-sqlite3` backend support and backend-neutral test coverage

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-04-19

### Added

- Publish the backend-neutral `mojidata-api` core as a standalone package.
- Export `SqlExecutor`, `createSqlApiDb`, IDS search helpers, and query expression utilities for adapter and app packages.

[1.8.0]: https://github.com/mandel59/mojidata/releases/tag/v1.8.0
