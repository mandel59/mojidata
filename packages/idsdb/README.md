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

## IDS data sources

`MOJIDATA_IDSDB_DATA_SOURCES` selects legacy IDS data sources independently
of the IRG source filter. Its default is `babelstone,usource`; the available
values are `babelstone` and `usource`. Other IDS data sources are supplied
through an IDSFlow recipe.

An experimental EIDS database is built in two explicit steps. The optional,
separately licensed adapter first writes the neutral IDSFlow records format:

```sh
yarn workspace @mandel59/idsflow-eids exec idsflow-eids \
  --data-source chise /absolute/path/to/dictionary.eids \
  > /absolute/path/to/chise.idsflow.jsonl

MOJIDATA_IDSDB_RECIPE=/absolute/path/to/chise.idsflow.yaml \
MOJIDATA_IDSDB_OUT_DIR=/absolute/path/to/idsdb-eids \
yarn workspace @mandel59/idsdb prepare
```

The recipe reads the generated file without loading EIDS adapter code:

```yaml
version: 1
datasets:
  chise:
    read:
      kind: records-jsonl
      path: chise.idsflow.jsonl
output: chise
```

The output directory is created automatically and has its own input-hash
stamp, so different experimental databases can coexist. Relative input and
output paths are resolved from the workspace root.

The MIT database builder accepts only the neutral file. It does not import,
link, or dynamically load the EIDS adapter. EIDS remains an IDS data source,
not an IRG source. Conversion counts and the neutral input digest are stored
in `idsfind_build_meta`. The source EIDS data may have licensing terms
independent of both packages and must be reviewed separately.

## IDSFlow recipes

`MOJIDATA_IDSDB_RECIPE` selects a backend-independent IDSFlow transformation.
The language and shared recipes belong to `@mandel59/idsdb-utils`; this
package only supplies the filesystem/`moji.db` reader adapter and materializes
the evaluated corpus as an IDS database. See the
[`idsdb-utils` IDSFlow documentation](../idsdb-utils/README.md#idsflow).

```sh
MOJIDATA_IDSDB_RECIPE=/absolute/path/to/idsdb-utils/recipes/default.idsflow.yaml \
MOJIDATA_IDSDB_OUT_DIR=/absolute/path/to/idsdb-experiment \
yarn workspace @mandel59/idsdb prepare
```

The recipe setting accepts an absolute path or a path relative to the invocation
directory. Inputs inside a recipe are resolved relative to the recipe file.
Recipe lookup deliberately does not use Node or Yarn package resolution.

Index, page-size, and output settings remain build settings outside IDSFlow.
Recipe builds reject the older IDS transformation environment variables to
avoid combining two transformation descriptions.

## Source-isolated research builds

For a source-isolated research build, set one decomposer source token and a
separate output directory. Source tokens use the Unicode IRG source prefix
base (for example `G`, `KP`, `SAT`, `SG`, `UK`, or `UTC`), rather than the
legacy one-letter designations stored from BabelStone IDS.TXT. The input IDS
snapshot, recursive lookup, and fallback candidates are all restricted to
that source. Build policy is stored
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
