# Local import-flow verification

Verified on 2026-09-22 using published mojidata 1.9.1 and idsdb-fts5 1.10.0
artifacts. No remote import was executed for this verification.

The former full import reported 5,494,879 rows read and 13,437,184 rows
written. It expanded views and built indexes over populated tables on D1.
The revised exporter expands views and groups IDS tokens locally, exports
literal values, and creates indexes before inserting rows.

## Results

- Both generated SQL files imported into fresh local SQLite databases;
  `PRAGMA quick_check` returned `ok` for both.
- All 192 mojidata tables/materialized views matched the source row for row,
  including duplicates, NULLs, BLOBs and generated column values:
  **4,365,166 rows**.
- All **164,101** IDS source rows and their rowids matched.
- All **3,686,329** FTS vocabulary instances matched, including term, document,
  column and token offset.
- All 47 import/preflight and lightweight CI tests passed.
- The actual import CLI rejected the mojidata artifact under the default
  100,000-write budget before calling Wrangler.
- A dry-run with both bindings and a synthetic 20,000,000-write test budget
  succeeded without contacting D1. This test budget is not an allocation or
  authorization for a remote import.

| Artifact | Data rows | Minimum row writes | SQL SHA-256 |
| --- | ---: | ---: | --- |
| mojidata | 4,365,166 | 13,439,302 | `589481c1815c26037edef7b762843bc527f50c5dcee87d79541cc1203c593103` |
| idsdb-fts5 | 269,747 | 433,848 | `cff3e4a3ecc4ae1ca11a32a62aa985c1edc0db0c599b10186b9f2d31adb4ffdf` |

These write counts are lower bounds, not measured Cloudflare billing. FTS
maintenance adds writes. Removing remote materialization/index backfills does
not establish zero billed reads. Full imports remain too large for the Free
daily write allowance and are blocked by default; small data changes need a
reviewed bounded delta. Consumed account quota is not restored by this fix.
