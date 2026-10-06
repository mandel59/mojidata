# Data license registry and distribution checks

The authoritative registry is `packages/mojidata/data-licenses.json`.
`download.txt` keeps its three-column downloader format. The registry must
exactly match every download's file name, URL, SHA-256, and license comment.
It also records both npm datasets (including the Yarn archive checksum and
data-file SHA-256) and the tracked TR38 build metadata.

Each resource records its original source, input versions, copyright/rights
basis, changes made by Mojidata, and affected SQLite table/view patterns.
`affectedTables` uses shell-style `*` patterns for dynamically generated
tables; it does not contain executable SQL.

## SPDX identifiers and custom terms

Standard `licenseId` values must be canonical identifiers from the pinned
official SPDX License List in `scripts/data/spdx-license-ids.json`. That file
records the list version, fixed source URL, and original JSON SHA-256; updating
it is an explicit repository change, not a network operation during builds.

SPDX defines `LicenseRef-<idstring>` for locally defined licensing information;
see the [license-expression specification](https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/).
These references are used for BabelStone's use/waiver statement, Japan's
government-notice rights exclusion, and Unicode report terms. Their
`hasExtractedLicensingInfos` definitions preserve the actual packaged notice
text and source links. Undefined references, identifiers outside the standard
list, and stale extracted text fail validation. CC0 is used only where the
pinned source actually declares it; public-domain status is not converted into
an invented CC0 grant.

The registry and `data-notices.json` are project-specific JSON manifests with
SPDX-compatible identifiers and definition fields; they are not complete SPDX
SBOM documents. npm `license` fields summarize standard licenses applying to
the bundled code/data. Per-resource notices describe their scope; the package
summary does not relicense every database row under every listed license.

## Updating inputs or notices

1. Inspect the license declaration for the exact source version being imported.
   Preserve its terms/notice and applicable attribution under
   `packages/mojidata/licenses/`; retain pinned upstream declarations under
   `licenses/sources/` where appropriate.
2. Update the input's source/version/checksum, rights information, transformation
   description, and affected tables in the registry. Update SHA-256 values in
   `noticeFiles` after notice changes. Keep `LicenseRef` extracted text identical
   to its referenced notice. For downloads update `download.txt` in the same
   change; for npm data update the dependency, lock checksum, and dataset hash.
3. Regenerate and check distributed notices:

   ```sh
   python3 scripts/check-data-licenses.py --write
   python3 scripts/check-data-licenses.test.py
   python3 scripts/check-data-licenses.py
   ```

4. When the local inputs/DB are available, verify actual content and schema:

   ```sh
   python3 scripts/check-data-licenses.py --verify-inputs \
     --database packages/mojidata/dist/moji.db
   ```

5. Add the appropriate changeset and file-fingerprinted D1 quota review before
   release. Follow the Unicode update workflow for actual Unicode data changes.

All commands operate locally. Validation never downloads inputs, runs a DB
import, connects to D1, or scans DB data rows. The optional schema check uses
only a read-only local `sqlite_schema` query. Cache verification requires the
existing local cache and is optional in lightweight PR validation.

## Generated distribution manifests

`data-notices.json` is generated for `mojidata`, `idsdb`, `idsdb-fts5`, and
`idsdb-bvec`. The default IDS build uses merged BabelStone/Mojidata IDS,
Unicode U-source, Unihan Z variants, and CJKVI radical variants. The registry
selects those exact inputs and copies only their notices to the IDS packages.
Custom recipes or dataset overrides require a separate provenance/license
review; these manifests describe the default distribution.

TR38 property metadata is tracked as a build-only input. Its JSON and the
report itself are not in the npm distribution. The distributed Unihan values
retain their Unicode Data Files notice; report text is not silently assigned
that data-files license.

The check runs before `mojidata prepare`, in PR validation, and at the start of
release. Before npm publishing, release also creates real Yarn archives for
all four database packages and validates each required notice's bytes, the
manifest, the code-license summary, and the exclusion of the build-only input:

```sh
corepack yarn workspace @mandel59/mojidata pack --out /tmp/mojidata.tgz
python3 scripts/check-data-licenses.py --archive @mandel59/mojidata /tmp/mojidata.tgz
```

Missing or altered notices, stale generated/copy files, changed input hashes,
unregistered downloads/npm dataset imports, and license mismatches stop the
build or release. The gate verifies records and packaging; the source-specific
legal interpretation remains a review responsibility.
