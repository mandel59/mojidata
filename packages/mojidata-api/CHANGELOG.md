# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.7.2] - 2026-02-15

### Added

- Extend `/api/v1/idsfind` search keys with broader Unihan property support across IRG sources, numeric values, readings, and variants.
- Add `unihan.kStrange` category search keys (`unihan.kStrange.<Category>` and `.glob`).
- Add `glob` support for `mji.読み` (`mji.読み.glob`).
- Add unit and integration tests for the new key resolution and idsfind behavior.

### Changed

- Accept `.eq` key aliases (e.g. `unihan.kTotalStrokes.eq`, `totalStrokes.eq`) and normalize them to equality semantics.
- Improve variant matching to accept both literal characters and `U+XXXX` input forms.

## [1.7.1] - 2026-01-26

### Changed

- Include `tsconfig.json` in the published package files.

## [1.7.0] - 2026-01-25

### Added

- Add API endpoints: `/api/v1/ivs-list` and `/api/v1/mojidata-variants`.
- Add IDS find debug-query support (`idsfindDebugQuery`).

### Changed

- Add `prepare` build step and publish built JS/typings for consumers.

[1.7.2]: https://github.com/mandel59/mojidata/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/mandel59/mojidata/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/mandel59/mojidata/compare/v1.6.3...v1.7.0
