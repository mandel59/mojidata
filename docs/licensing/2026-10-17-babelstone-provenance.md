# BabelStone IDS provenance notice

Reviewed on 2026-10-17 JST for issue #80.

The packaged BabelStone notice previously preserved only documentation item 2
from the pinned IDS.TXT. Item 1 identifies the original data providers, Andrew
West's formatting and extensive corrections, and contributors to those
corrections. Preserve both items together so the distribution retains this
provenance and acknowledgment context alongside the use/waiver statement.

The source is mirror revision `6d0989b007bdfa566a864419448b125799ef5f9f`, with
SHA-256 `cc2a0a97e6a51ed6ebe59870ef2af66e83f3c3c27387d79b4441bb2d791d78b1`.
The existing local cache was verified against that checksum before extracting
item 1. All four packaged notices match items 1 and 2 from that source exactly
after normalizing CRLF to LF. The registry provenance summary, notice checksum,
LicenseRef extracted text, and generated distribution manifests were updated.
The main package's license summary also identifies the original providers.

## Validation and D1 impact

- `python3 scripts/check-data-licenses.test.py`: all 24 tests passed.
- `python3 scripts/check-data-licenses.py --verify-inputs --database
  packages/mojidata/dist/moji.db`: all 14 resources and four distributions
  passed, including existing cached inputs and local read-only schema checks.
- The four actual Yarn package archives pass `check-data-licenses.py --archive`;
  the checker verifies notice bytes, manifests, and packaged license summaries.
- The file-fingerprinted quota record covers all changed package artifacts.

Only notice text, provenance metadata, and a patch changeset change. Download
declarations, input versions and hashes, DB builders, SQL, indexes, request
fan-out, import tools, and deployment configuration are unchanged. The notice
and registry files are outside the inputs enumerated by the DB fingerprint
scripts. The local moji.db SHA-256 is
`75eecbef86bd33f0155959d59e6e62d129bf18a156ac6e32fffbc94071b4be2a`;
no Mojidata DB rebuild is needed for this change.

Notice generation, validation, local packing, and the ordinary GitHub/npm
release workflow consume zero D1 rows read and written, including retries.
No remote query, import, migration, or Worker deployment is executed or
authorized by this review. Stop if source data or runtime paths change, archive
notices differ, or quota fingerprints become stale. Recover notice errors with
a corrective package release; no database rollback is required.
