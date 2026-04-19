# Mojidata IDS DB

This package provides the prebuilt SQLite databases used by the IDS tools.

By default `yarn prepare` rebuilds `idsfind.db` with an FTS4 index for the
existing local SQLite consumers.

For backends that support SQLite FTS5, use the separate
`@mandel59/idsdb-fts5` package, which publishes an FTS5-flavored `idsfind.db`.

## License

[MIT](./LICENSE.md)
