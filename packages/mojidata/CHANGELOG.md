# Change Log

## 1.8.0

### Minor Changes

- [#38](https://github.com/mandel59/mojidata/pull/38) [`6c932e6`](https://github.com/mandel59/mojidata/commit/6c932e64de9280bf886fc469758546cedd979d2e) Thanks [@mandel59](https://github.com/mandel59)! - Add a generated `unihan_value_ref` reverse lookup table and use it for
  `unihan_fts` queries so D1-backed `/api/v1/mojidata` requests no longer scan the
  full Unihan value table.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.7.2] - 2026-02-15

### Changed

- Build script now explicitly downloads `ids-unicode-17.0.txt` during `scripts/build`.
- `prepare` now skips full DB regeneration when build inputs are unchanged (incremental hash check).

## [1.7.0] - 2026-01-25

- IDS build: Support patch files (e.g. `ids-unicode-17.0.txt`) with last-file-wins overwrite by UCS.
- download.txt: Pin `ids-unicode-17.0.txt` URL to a specific commit for reproducible downloads.

[1.7.2]: https://github.com/mandel59/mojidata/compare/v1.7.0...v1.7.2
[1.7.0]: https://github.com/mandel59/mojidata/compare/v1.6.2...v1.7.0

## [1.6.2] - 2025-09-11

- Update UCD to version 17.0.0
- Update IDS.TXT

[1.6.2]: https://github.com/mandel59/mojidata/compare/v1.6.1...v1.6.2

## [1.6.1] - 2025-02-12

- Update IDS.TXT

[1.6.1]: https://github.com/mandel59/mojidata/compare/v1.6.0...v1.6.1

## [1.6.0] - 2024-09-11

- Update UCD to version 16.0.0
- Update IDS.TXT

[1.6.0]: https://github.com/mandel59/mojidata/compare/v1.5.0...v1.6.0

## [1.5.0] - 2024-06-06

- Update licenses/unicode.txt. Unicode License v3 is now applied for the Unicode data.

[1.5.0]: https://github.com/mandel59/mojidata/compare/v1.4.3...v1.5.0

## [1.4.3] - 2024-05-13

### Changed

- Update IDS.TXT

[1.4.3]: https://github.com/mandel59/mojidata/compare/v1.4.1...v1.4.3

## [1.4.1] - 2024-01-17

- Republish correctly built package

[1.4.1]: https://github.com/mandel59/mojidata/compare/v1.4.0...v1.4.1

## [1.4.0] - 2024-01-17

### Changed

- Update MJ 文字情報一覧表 to version 006.02
- Update UCD/Unihan to version 15.1
- Change definition of radicals table

[1.4.0]: https://github.com/mandel59/mojidata/compare/v1.3.0...v1.4.0

## [1.3.0] - 2023-06-29

### Added

- Add MJ 文字情報一覧表 変体仮名編 https://moji.or.jp/mojikiban/mjlist/

[1.3.0]: https://github.com/mandel59/mojidata/compare/v1.2.0...v1.3.0

## [1.2.0] - 2023-04-08

### Changed

- Updated IDS.TXT

[1.2.0]: https://github.com/mandel59/mojidata/compare/v1.1.0...v1.2.0

## [1.1.0] - 2023-01-13

### Changed

- Updated IDS.TXT

[1.1.0]: https://github.com/mandel59/mojidata/compare/v1.0.0...v1.1.0

## [1.0.0] - 2022-10-12

### Changed

- Update `IVD_Sequences.txt` to <https://www.unicode.org/ivd/data/2022-09-13/IVD_Sequences.txt>.

### Fixed

- `radeqv`: Fix EquivalentUnifiedIdeograph.txt loader.

[1.0.0]: https://github.com/mandel59/mojidata/releases/tag/v1.0.0

## 0.5.0 - 2022-07-13

### Changed

- Update data from Unicode Character Database to version 15.0.
