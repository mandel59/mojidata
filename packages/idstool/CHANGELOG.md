# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.6.0] - 2024-09-11

- Update Mojidata to version 1.6.0.

## [1.5.0] - 2024-06-06

- Normalize 𤣩 with 王 instead of 玉.

## [1.4.3] - 2024-05-13

### Changed

- Update IDS.TXT

## [1.4.2] - 2024-02-15

### Added

- Add multiplicity specifier syntax.
  `ids-find 木 '耳*3'` finds characters that contain 木 and 3 耳.

## [1.4.1] - 2024-01-17

- Republish correctly built package

## [1.4.0] - 2023-09-18

### Change

- Support new IDS operators of Unicode 15.1

## [1.3.0] - 2023-06-29

### Added

- Add USource characters to the FTS index.

## [1.2.8] - 2023-04-27

### Fixed

- idstool is now correctly prepared.

## [1.2.7] - 2023-04-27

### Changed

- idstool: Expose more database options.

## [1.2.6] - 2023-04-27

### Changed

- idstool: Add close method to IDSFinder class

## [1.2.5] - 2023-04-26

### Changed

- idstool: Use kdpv relation to normalize radical variants.

## [1.2.4] - 2023-04-11

### Fixed

- idstool: placeholders are now correctly handled when they appear after unary
  operators in search queries.

## [1.2.3] - 2023-04-10

### Changed

- idstool: Revert type definition files. Removed TypeScript source files.

## [1.2.2] - 2023-04-10

### Changed

- idstool: Added TypeScript source files. Removed type definition files.
- idstool: Improved overlaid operator handlings.

## [1.2.1] - 2023-04-10

### Added

- idstool: Add type definition files.

## [1.2.0] - 2023-04-08

### Removed

- Removed web-idsfind.

### Changed

- Updated IDS.TXT
- Updated better-sqlite3.

## [1.1.0] - 2023-01-13

### Added

- ids-find: Add query debugging option `--debug-query`.
- ids-find: Add capturing variables. find 三疊字/品字様 by `ids-find --whole=⿱x⿰xx`.

### Changed

- ids-decompose: Skip IDS including "&s-".
- ids-find: Fix a problem a Kanji character would not be found in cases
    where no IDS existed for the pair of component and the source.
- ids-find: Ignore variation selectors in IDS queries.
- ids-find: Fix a bug that queries with placeholders (`？`) without `--whole` option don't work.
- ids-find: Change to search by IDS containing 〾

## [1.0.0] - 2022-10-12
### Changed
- Update mojidata
