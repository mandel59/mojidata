# Change Log

## 1.10.2

### Patch Changes

- [#66](https://github.com/mandel59/mojidata/pull/66) [`cad73a7`](https://github.com/mandel59/mojidata/commit/cad73a727d8919389d92f853e3bcaa448051f601) Thanks [@mandel59](https://github.com/mandel59)! - Filter variant relation sources using existing indexes before decoding Unihan values and joining MJ mappings, avoiding full relation scans that exhaust Cloudflare D1 read quotas.

## 1.10.1

### Patch Changes

- [#63](https://github.com/mandel59/mojidata/pull/63) [`5f15a50`](https://github.com/mandel59/mojidata/commit/5f15a508a81acc0e18280b9ed77a9aa73958f77b) Thanks [@mandel59](https://github.com/mandel59)! - Allow code point searches throughout planes 2 and 3 regardless of the JavaScript runtime Unicode version, including newly assigned characters such as U+2B81E.

## 1.10.0

### Minor Changes

- [`65dc878`](https://github.com/mandel59/mojidata/commit/65dc878f67f4effdaa4a1f9a540f99767c0c5938) Thanks [@mandel59](https://github.com/mandel59)! - Add a versioned IDSgrep-inspired BV128 encoder and an opt-in Bloom-vector
  candidate provider while retaining exact IDS verification and FTS defaults.

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

- [#53](https://github.com/mandel59/mojidata/pull/53) [`d272a29`](https://github.com/mandel59/mojidata/commit/d272a29bad0038622b704d5f045664957ea5a77a) Thanks [@mandel59](https://github.com/mandel59)! - Split variant-relation expansion into D1-safe query batches while preserving transitive search semantics.

- Updated dependencies [[`65dc878`](https://github.com/mandel59/mojidata/commit/65dc878f67f4effdaa4a1f9a540f99767c0c5938), [`fbb8fca`](https://github.com/mandel59/mojidata/commit/fbb8fca29b73c437f5eb92e992eaf688e35ed5d8), [`08b3899`](https://github.com/mandel59/mojidata/commit/08b38995c8fe5cc136415bae5fcd5cc0ff8d5294), [`d2b7bca`](https://github.com/mandel59/mojidata/commit/d2b7bcaad55dfb8d237f0d993c48560558d8bb62), [`679de31`](https://github.com/mandel59/mojidata/commit/679de31ef324825e0f43e9733fb90ad4c401b488)]:
  - @mandel59/idsdb-utils@1.8.0

## 1.9.2

### Patch Changes

- [#54](https://github.com/mandel59/mojidata/pull/54) [`6c643c7`](https://github.com/mandel59/mojidata/commit/6c643c70a069bb6aae087b1998ad9d31676e89b9) Thanks [@mandel59](https://github.com/mandel59)! - Compile IDS exact-match audit patterns before scanning candidates and avoid
  asynchronous work inside the matcher hot loop.

## 1.9.1

### Patch Changes

- [#45](https://github.com/mandel59/mojidata/pull/45) [`8a1930a`](https://github.com/mandel59/mojidata/commit/8a1930a7d1fe68264813dc312aa93d4f5cd13fc6) Thanks [@mandel59](https://github.com/mandel59)! - Optimize mojidata full-field D1 lookup SQL to use index-friendly predicates for IDS, IVS, SVS, TGHB, MJIH, and KDPV data.
  Include current IDS mirror and rotation operators in `ids_similar` lookups while keeping legacy aliases.

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
