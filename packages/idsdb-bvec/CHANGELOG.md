# @mandel59/idsdb-bvec

## 0.2.2

### Patch Changes

- [#84](https://github.com/mandel59/mojidata/pull/84) [`b0886e8`](https://github.com/mandel59/mojidata/commit/b0886e88cff42a57f6974790e53664e0397cf0c6) Thanks [@mandel59](https://github.com/mandel59)! - Include BabelStone IDS documentation item 1 alongside item 2 in the packaged notices, preserving the original data providers, editing history, and contributor acknowledgments. Update provenance summaries and generated license manifests.

## 0.2.1

### Patch Changes

- [#81](https://github.com/mandel59/mojidata/pull/81) [`4e84f76`](https://github.com/mandel59/mojidata/commit/4e84f76fba3ec4f2d1a5e564f45088f6eb14d677) Thanks [@mandel59](https://github.com/mandel59)! - Bundle `data-notices.json` and license notices for the default IDS source data. Record source versions and hashes, and correct the packages' aggregate SPDX license expressions to reflect the bundled datasets.

## 0.2.0

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

## 0.1.0

- Add the initial packed BV128 candidate-index database.
