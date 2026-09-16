# Change Log

## 1.8.0

### Minor Changes

- [`fbb8fca`](https://github.com/mandel59/mojidata/commit/fbb8fca29b73c437f5eb92e992eaf688e35ed5d8) Thanks [@mandel59](https://github.com/mandel59)! - Normalize BabelStone IDS source expressions to Unicode IRG source prefix bases
  when building and querying IDSDB data. Source filters and IDS decomposition now
  use canonical tokens such as `KP`, `SAT`, `SG`, `UK`, and `UTC`, while
  `@mandel59/mojidata` continues to preserve the original BabelStone source
  expression.

- [`08b3899`](https://github.com/mandel59/mojidata/commit/08b38995c8fe5cc136415bae5fcd5cc0ff8d5294) Thanks [@mandel59](https://github.com/mandel59)! - Add an experimental IDSFlow path for external IDS data without modifying
  `moji.db`. A separate, currently private adapter converts IDSgrep EIDS
  dictionaries into a versioned neutral JSONL format; MIT IDSDB packages consume
  only that file and do not depend on the adapter. Build metadata records the
  selected IDS data sources, upstream conversion counts, input path, and SHA-256
  digest. IDSDecomposer also accepts adapter-provided IDS rows and expands named
  entity definitions when present.

- [`679de31`](https://github.com/mandel59/mojidata/commit/679de31ef324825e0f43e9733fb90ad4c401b488) Thanks [@mandel59](https://github.com/mandel59)! - Integrate IDS search improvements with 4 KiB database pages, cycle detection
  before recursive decomposition, optional candidate providers, and versioned
  query semantics shared by database builders and API backends. Existing
  databases retain legacy query behavior; strict registered semantics and
  experimental query plans require explicit opt-in.

  Invalidate derived database caches after recipe builds or failed builds and
  when builder libraries change. Fix source-cache pruning when several resource
  links share one download. Unicode input pins and deployed D1 bindings are
  unchanged by this integration.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.7.0] - 2026-01-25

### Changed

- Update build-time dependency versions for the 1.7.0 release (database files unchanged).

[1.7.0]: https://github.com/mandel59/mojidata/compare/v1.6.3...v1.7.0
