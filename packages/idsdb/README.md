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

`MOJIDATA_IDSDB_DATA_SOURCES` selects IDS data sources independently of the
IRG source filter. Its default is `babelstone,usource`. Available values are
`babelstone`, `usource`, and `eids`.

An experimental EIDS-only database can be built from an IDSgrep `.eids` file:

```sh
MOJIDATA_IDSDB_DATA_SOURCES=eids \
MOJIDATA_IDSDB_EIDS_PATH=/absolute/path/to/dictionary.eids \
MOJIDATA_IDSDB_OUT_DIR=/absolute/path/to/idsdb-eids \
yarn workspace @mandel59/idsdb prepare
```

The output directory is created automatically and has its own input-hash
stamp, so different experimental databases can coexist. Relative input and
output paths are resolved from the workspace root.

The EIDS adapter converts root heads to result identifiers, canonicalizes
IDSgrep operator aliases such as `[lr]` and `[tb]`, removes structural-node
heads, and maps nullary named components such as `<CDP-8B7C>;` to Mojidata
entity tokens such as `&CDP-8B7C;`. EIDS operators that ordinary IDS cannot
represent are counted and skipped. Conversion counts and an SHA-256 digest of
the input are stored in `idsfind_build_meta`.

EIDS is an IDS data source, not an IRG source. Because an EIDS file does not
provide IRG source metadata, an EIDS build cannot be combined with
`MOJIDATA_IDSDB_SOURCE`.

## IDSFlow recipes

`MOJIDATA_IDSDB_RECIPE` selects a version 1 YAML recipe for IDS conversion.
The first version has four operations: `read`, `select`, `union`, and
`decompose`. Relative input paths are resolved from the recipe directory.

```yaml
version: 1
datasets:
  babelstone:
    read: { kind: moji-ids }
  selected:
    select: { input: babelstone, irg_source: [G, SG] }
  chise:
    read:
      kind: eids
      path: chise.eids
      data_source: chise
  definitions:
    union: { inputs: [selected, chise] }
  usource:
    read: { kind: moji-usource }
  roots:
    union: { inputs: [definitions, usource] }
  expanded:
    decompose:
      input: roots
      using: definitions
output: expanded
```

`decompose.using` defaults to `decompose.input`. It is needed above because
the existing build searches U-Source records as roots without using them as
recursive component definitions. Decomposition keeps the existing defaults:
Z-variant expansion and KDPV radical normalization are enabled, undefined
components remain atomic, and structural cycles are errors. The two
normalizations can be disabled with `expand_z_variants: false` and
`normalize_kdpv_radical_variants: false`.

```sh
MOJIDATA_IDSDB_RECIPE=/absolute/path/to/idsflow.yaml \
MOJIDATA_IDSDB_OUT_DIR=/absolute/path/to/idsdb-experiment \
yarn workspace @mandel59/idsdb prepare
```

Index, page-size, and output settings remain build settings outside IDSFlow.
Recipe builds reject the older IDS transformation environment variables to
avoid combining two transformation descriptions.
[`recipes/default.idsflow.yaml`](./recipes/default.idsflow.yaml) reproduces
the existing BabelStone plus U-Source transformation.

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
