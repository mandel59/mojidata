# Mojidata IDS DB

This package provides the prebuilt SQLite databases used by the IDS tools.

By default `yarn prepare` rebuilds `idsfind.db` with an FTS4 index for the
existing local SQLite consumers.

Generated databases use 4096-byte SQLite pages by default. Set
`MOJIDATA_IDSDB_PAGE_SIZE` to a supported power of two from 512 through 65536
when regenerating an experimental variant.

For backends that support SQLite FTS5, use the separate
`@mandel59/idsdb-fts5` package, which publishes an FTS5-flavored `idsfind.db`.

For the current compatibility decision and the recorded FTS4/FTS5 comparison,
see [docs/idsfind-fts-comparison.md](../../docs/idsfind-fts-comparison.md).

## License

[MIT](./LICENSE.md)
