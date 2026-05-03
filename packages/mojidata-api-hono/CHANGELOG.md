# Change Log

## 1.8.1

### Patch Changes

- [#38](https://github.com/mandel59/mojidata/pull/38) [`ce35942`](https://github.com/mandel59/mojidata/commit/ce359424defe3d78b263c655a5461b5c8a2e75ea) Thanks [@mandel59](https://github.com/mandel59)! - Add `Cache-Control: no-store` to mojidata-api JSON responses so D1 blue/green
  cutovers are not hidden by stale consumer-side caches.
- Updated dependencies [[`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e), [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e)]:
  - @mandel59/mojidata-api-core@1.9.0

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-04-19

### Added

- Publish the Hono app wiring package for `mojidata-api`.
- Export the `createApp` entry point along with `api/v1` handlers and compatibility helper modules.

[1.8.0]: https://github.com/mandel59/mojidata/releases/tag/v1.8.0
