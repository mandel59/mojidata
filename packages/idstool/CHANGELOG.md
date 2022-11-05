# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## Unreleased

- ids-decompose: Skip IDS including "&s-".
- ids-find: Add query debugging option `--debug-query`.
- ids-find: Fix a problem a Kanji character would not be found in cases
    where no IDS existed for the pair of component and the source.
- ids-find: Ignore variation selectors in IDS queries.

## [1.0.0] - 2022-10-12
### Changed
- Update mojidata
