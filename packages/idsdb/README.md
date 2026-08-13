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

## Source-isolated research builds

For a source-isolated research build, set one decomposer source token and a
separate output directory. The input IDS snapshot, recursive lookup, and
fallback candidates are all restricted to that source. Build policy is stored
in `idsfind_build_meta`.

```sh
MOJIDATA_IDSDB_SOURCE=G \
MOJIDATA_IDSDB_EXPAND_Z_VARIANTS=0 \
MOJIDATA_IDSDB_NORMALIZE_KDPV_RADICAL_VARIANTS=1 \
MOJIDATA_IDSDB_INDEX_MODE=fts5 \
MOJIDATA_IDSDB_OUT_DIR=./tmp/idsdb-g \
yarn workspace @mandel59/idsdb prepare
```

## License

[MIT](./LICENSE.md)
