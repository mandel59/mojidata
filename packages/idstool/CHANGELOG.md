# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

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
