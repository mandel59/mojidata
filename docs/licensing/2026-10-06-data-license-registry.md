# Data license registry review (2026-10-06)

Related: #80. This review covers the local registry, generated notices,
packaging and CI checks described in [the maintenance guide](../data-licenses.md).

## Source coverage and identifiers

`packages/mojidata/data-licenses.json` records 14 resources: all 38 download
inputs, both npm datasets, and the tracked TR38 build-only metadata. Each input
has a version, source and SHA-256; npm inputs also have their Yarn checksum.
The registry records transformations, attribution, notices and affected DB
table/view patterns. Preserved source declarations were reviewed in
[the preceding notice review](2026-10-06-data-notices.md).

Standard identifiers are checked against SPDX License List 3.29.0, from the
fixed official `license-list-data` revision
`31ba1a50e5397e00a304dbadc76531740e89ee48`. The catalog records the original
JSON checksum. BabelStone's waiver, Japanese government-notice rights
exclusion, and Unicode report terms use defined SPDX `LicenseRef-` identifiers,
with extracted notice text and source links. Undefined references and invented
standard IDs fail validation. These JSON manifests are not full SPDX SBOMs.

TR38 property metadata is used internally to generate Unihan property views.
It is identified separately from Unicode data-file terms and excluded from
the distributed-data selection. Its tracked JSON and the report are not
packed. This change adds no report content to the public distribution.

The default IDS recipe uses merged BabelStone/Mojidata IDS, Unicode U-source,
Unihan Z variants and CJKVI radical variants. The trace is
`packages/idsdb/prepare.ts` and
`packages/idsdb-utils/lib/ids-decomposer.ts`. The registry selects those input
files and preserves their notices in all three IDS packages. Custom recipes
or input overrides require their own source review.

## Local validation

- 22 validator tests pass, including missing/altered notices, unknown SPDX IDs,
  undefined/stale custom definitions, input/version/checksum mismatches,
  unsafe paths, stale generated notices and archive omissions/tampering.
- All 38 cached downloads, both cached npm archives/datasets and the tracked
  build-only input match their recorded hashes. Local read-only
  `sqlite_schema` validation confirms the affected table/view patterns.
- Real Yarn archives for `mojidata`, `idsdb`, `idsdb-fts5` and `idsdb-bvec`
  contain the generated manifests and required notice bytes. Archived package
  identity/license summaries match, and build-only metadata is absent.
- All 38 ordered noncomment download rows are unchanged. The existing
  `moji.db` SHA-256 remains
  `c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b`.
- The five existing DB input fingerprint tests pass; workflow YAML parses
  and the modified shell prepare script passes `bash -n`.

The commands are in the maintenance guide. Archive verification reads tar
members without extracting files. Tests and validation do not fetch inputs,
query D1 or scan local DB data rows.

## D1 impact and release boundary

Before and after this change, the incremental account-wide D1 reads/writes
are both zero. No source-data values, SQL, views, indexes, runtime queries,
API fan-out, import tools or Worker bindings change. Registry checks and
notice copies only read/write local files; the optional schema query opens
an existing local SQLite DB read-only.

Changes to download comments, package manifests and the prepare script can
invalidate the existing local build fingerprint and cause a local rebuild.
The actual dataset inputs and DB bytes are unchanged. The npm release
workflow builds, packs and checks local artifacts; it does not import into
D1 or deploy a Worker. Additional archive checks and their retries therefore
consume zero D1 rows. No account quota is sampled or allocated for this work.

Release the notices through normal patch releases. Stop on a validation
failure, stale review fingerprint, unexpected dataset/SQL change or missing
archive notice. Correct metadata in a subsequent package release; no DB
migration is needed. This record does not authorize any later remote import
or deployment.
