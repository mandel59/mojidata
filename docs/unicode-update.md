# Unicode data update workflow

Updating download URLs and rebuilding the database is not sufficient: new or
changed properties can require changes to derived views, API queries, and search
registrations. Complete the property review below before releasing a Unicode
update.

## 1. Preserve the baseline and update inputs

- Record the previous Unicode version and the Jujutsu revision before updating.
  Retain the old `Unihan.zip` (including its checksum) for the data comparison.
- Run `packages/mojidata/scripts/update-unicode <version>` and review the URL and
  checksum changes in `packages/mojidata/download.txt` with `jj diff --git`.
- Read the target release's UCD and UAX #38 change notes. Use the specification
  revision for the target version, rather than assuming the latest TR38 page
  describes it.

## 2. Compare property definitions and actual data

`scripts/cache-unihan-doc` and the normal build reuse the checked-in metadata
cache; they do not refresh it from the network when it already exists. Fetch the
target TR38 revision into a fresh path, inspect it, then replace the checked-in
cache. For example, from the repository root:

```sh
# Set this to the TR38 revision linked by the target Unicode release.
target_tr38_url=https://www.unicode.org/reports/tr38/tr38-41.html
unicode_review_dir=$(mktemp -d)
TR38_URL="$target_tr38_url" \
TR38_CACHE_PATH="$unicode_review_dir/unihan-tr38-properties.json" \
  yarn workspace @mandel59/mojidata cache-unihan-doc
diff -u packages/mojidata/build-data/unihan-tr38-properties.json \
  "$unicode_review_dir/unihan-tr38-properties.json"
```

`diff` exits with status 1 when differences are found. Verify that the downloaded
metadata is nonempty and matches the target version before copying it to
`packages/mojidata/build-data/unihan-tr38-properties.json`. Compare against the
recorded baseline revision if the checked-in cache has already been updated.

Review both sources of differences:

- **Specification:** added/removed properties and changes to `Category`,
  `Delimiter`, `Syntax`, `Status`, and `Introduced`. Read description changes in
  TR38 separately: the JSON cache deliberately omits `Description`.
- **Actual Unihan data:** compare the property names and per-property record/token
  counts across all text files in the old and new archives. Check for properties
  missing from the metadata, new value formats, and properties disappearing from
  the data. A property can move between files; do not limit the comparison to
  `Unihan_Variants.txt`.

Record each added, removed, or changed property's old/new definition, data counts,
affected consumers, and required action (or why no code change is needed) in the
update's review notes. Also compare the full current set of variant properties
against implementation lists, so an omission from an earlier update is detected.

## 3. Review every affected consumer

For Unihan variants, check these independently:

| Consumer | Implementation | Check |
| --- | --- | --- |
| DB variant view | `packages/mojidata/scripts/create-db.ts`, `variantTables` | Inclusion in `unihan_variant`, code point decoding, token splitting, and additional data |
| D1 import materialization | `scripts/prepare-mojidata-d1-import.mjs`, `buildUnihanVariantMaterializationStatementsFromRelations` | Inclusion in the materialized `unihan_variant` table; compare imported relations with the published SQLite view |
| API variant graph | `packages/mojidata-api-core/lib/mojidata-variant-queries.ts`, `variantQueries` | Inclusion in graph edges and correct underlying table |
| Property search | `packages/mojidata-api-core/lib/libsearch.ts`, `unihanVariantProperties` | Exact, glob, and existence search registration |
| Character details | `packages/mojidata-api-core/lib/query-expressions.ts` | Forward `unihan_variant` and reverse `unihan_variant_inverse` output |
| Reverse candidates | `packages/mojidata/scripts/create-db.ts`, `unihan_value_ref` | Coverage of every new relation target |

The metadata's `Delimiter` controls storage: a space-delimited property uses an
`unihan_each_<property>` table and an aggregated `unihan_<property>` view; a
single-valued property uses an `unihan_<property>` table. Adding an API query to
the wrong table family can fail even when the DB variant view works.

Unicode 18.0 illustrates the required check: `kJapaneseNewVariant` is
single-valued, while `kJapaneseOldVariant` is space-delimited. Both must be
considered in all four explicit lists above. Raw data and metadata ingestion
alone do not expose their variant relations. Keep existing special handling for
`kCompatibilityVariant`, `kJoyoKanji`, and `kJinmeiyoKanji`; the TR38 `Variants`
category alone does not describe every relation currently exposed by Mojidata.

For other changed properties, trace their use through DB generation, API output,
search, and any format-specific parsers in the same way.

## 4. Verify the generated behavior before release

- Rebuild the database with the reviewed inputs and metadata. Compare raw record
  counts and decoded relation counts for each affected property; account for
  multiple values per character.
- Check representative forward and reverse lookups, including a multi-valued
  example where applicable. For the Unicode 18 additions, examples include
  `國 → 国`, `国 → 國`, and `弁 → 瓣・辨・辯`. Assert the property labels as well as
  endpoints: another source can already connect the same characters and hide an
  omitted property.
- Verify API graph traversal and exact/glob/existence searches independently of
  the DB view. Add regression coverage for the changed semantics and run the
  affected package tests.
- Review variant-query equivalence tests when relation semantics change. Agreement
  with a legacy query is insufficient if both omit the new property; retain
  coverage of unchanged relations and explicitly verify the new ones.
- Include the property review results and validation in the update description,
  then follow the normal release workflow and deployment checks. Do not mark an
  update complete while a required consumer remains unhandled.

- Before release, follow [the D1 quota policy](d1-quota-policy.md). Measure the
  impact of added rows/relations on complete requests and recursive traversal,
  even when SQL is unchanged, and budget the import/delta and validation together.
