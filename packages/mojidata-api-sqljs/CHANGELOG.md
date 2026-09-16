# Change Log

## 1.9.0

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

- Updated dependencies [[`65dc878`](https://github.com/mandel59/mojidata/commit/65dc878f67f4effdaa4a1f9a540f99767c0c5938), [`d272a29`](https://github.com/mandel59/mojidata/commit/d272a29bad0038622b704d5f045664957ea5a77a), [`fbb8fca`](https://github.com/mandel59/mojidata/commit/fbb8fca29b73c437f5eb92e992eaf688e35ed5d8), [`1917b8b`](https://github.com/mandel59/mojidata/commit/1917b8bb56a852af275d0fe2c2ba6dd1356b8a73), [`08b3899`](https://github.com/mandel59/mojidata/commit/08b38995c8fe5cc136415bae5fcd5cc0ff8d5294), [`679de31`](https://github.com/mandel59/mojidata/commit/679de31ef324825e0f43e9733fb90ad4c401b488), [`6581b2d`](https://github.com/mandel59/mojidata/commit/6581b2d4b78db8c520f4a66cf3873e53f7a8475c)]:
  - @mandel59/mojidata-api-core@1.10.0
  - @mandel59/idsdb@1.8.0
  - @mandel59/mojidata@1.9.0
  - @mandel59/mojidata-api-runtime@2.1.0

## 1.8.1

### Patch Changes

- Updated dependencies [[`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e), [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e), [`c121956`](https://github.com/mandel59/mojidata/commit/c12195685a8dcae6f2f5c15ee6a08dc866e20f77), [`ce35942`](https://github.com/mandel59/mojidata/commit/ce359424defe3d78b263c655a5461b5c8a2e75ea), [`30b6de0`](https://github.com/mandel59/mojidata/commit/30b6de0de5f7a38aeb0895c98c6b48299b15c6da), [`9e5fa3a`](https://github.com/mandel59/mojidata/commit/9e5fa3a8e481507dd6202c93a3c1286d93a2cc75)]:
  - @mandel59/mojidata@1.8.0
  - @mandel59/mojidata-api-core@1.9.0
  - @mandel59/mojidata-api-runtime@2.0.0
  - @mandel59/mojidata-api-hono@1.8.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.8.0] - 2026-04-19

### Added

- Publish the `sql.js` adapter package for `mojidata-api`.
- Export the sql.js executor, database openers, and Mojidata SQL function wiring as standalone package APIs.

[1.8.0]: https://github.com/mandel59/mojidata/releases/tag/v1.8.0
