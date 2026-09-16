# @mandel59/mojidata-api-d1

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

### Patch Changes

- Updated dependencies [[`65dc878`](https://github.com/mandel59/mojidata/commit/65dc878f67f4effdaa4a1f9a540f99767c0c5938), [`d272a29`](https://github.com/mandel59/mojidata/commit/d272a29bad0038622b704d5f045664957ea5a77a), [`679de31`](https://github.com/mandel59/mojidata/commit/679de31ef324825e0f43e9733fb90ad4c401b488)]:
  - @mandel59/mojidata-api-core@1.10.0

## 1.9.0

### Minor Changes

- [`bde6aaf`](https://github.com/mandel59/mojidata/commit/bde6aaff1867776920c42aa6089998f5e1177f73) Thanks [@mandel59](https://github.com/mandel59)! - Add env-based app and fetch handler helpers for embedding the D1 backend in
  Cloudflare Worker applications.

### Patch Changes

- Updated dependencies [[`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e), [`d75402f`](https://github.com/mandel59/mojidata/commit/d75402f46c75c25419160e8eafb1bc3f86fe705e), [`ce35942`](https://github.com/mandel59/mojidata/commit/ce359424defe3d78b263c655a5461b5c8a2e75ea)]:
  - @mandel59/mojidata-api-core@1.9.0
  - @mandel59/mojidata-api-hono@1.8.1
