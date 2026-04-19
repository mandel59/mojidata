# Mojidata IDS DB

This package provides the prebuilt SQLite databases used by the IDS tools.

By default `yarn prepare` rebuilds `idsfind.db` with an FTS4 index for the
existing local SQLite consumers.

For Cloudflare D1 experiments, use the separate `@mandel59/idsdb-d1` package,
which publishes an FTS5-flavored `idsfind.db` for D1 import flows.

## License

[MIT](./LICENSE.md)
