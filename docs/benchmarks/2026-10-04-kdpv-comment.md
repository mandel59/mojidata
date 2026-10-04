# KDPV comment quota evidence

Measured locally on 2026-10-04 before implementation. The final expression
was checked byte-for-byte against the measured proposed SQL.

Source: `packages/mojidata/dist/moji.db`, SHA-256
`c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b`.
KDPV contains 103,205 rows, of which 3,782 have nonempty comments.

The proposed `kdpv_comment` field matches both endpoint prefixes using ranges.
It retains original endpoints/relations, excludes null/empty comments, and
deduplicates identical records with UNION while preserving distinct comments.
Existing `kdpv` output and graph/search SQL are unchanged. Full responses add
the field to the existing JSON SQL statement; `select` excluding the field
adds no work. Selected requests still make one SQL call; full responses still
make four calls (JSON, two Unihan RS properties, and the radical lookup).
There is no recursive traversal or additional request/query fan-out.

For local D1-style lookup, KDPV and the shrink-map view were materialized in
temporary tables with the importer indexes; other source views were retained:

```sql
CREATE TEMP TABLE kdpv AS SELECT * FROM main.kdpv;
CREATE INDEX temp.kdpv_subject ON kdpv(subject);
CREATE INDEX temp.kdpv_object ON kdpv(object);
CREATE INDEX temp.kdpv_rel_subject ON kdpv(rel,subject);
CREATE TEMP TABLE mjsm AS SELECT * FROM main.mjsm;
CREATE INDEX temp.mjsm_MJ文字図形名 ON mjsm(MJ文字図形名);
CREATE INDEX temp.mjsm_縮退UCS ON mjsm(縮退UCS);
CREATE INDEX temp.mjsm_表 ON mjsm(表);
```

The comment query uses both existing D1 indexes:

```text
SEARCH kdpv USING INDEX kdpv_subject (subject>? AND subject<?)
SEARCH kdpv USING INDEX kdpv_object (object>? AND object<?)
```

The original KDPV UNION ALL view also uses 90 indexed ranges (45 source tables
in each direction), with no KDPV table scans. No schema/data/import changes
are needed: the existing importer exports comments and installs these indexes.

A local count of both endpoints grouped by their first character, including
IVS and multi-character IDS endpoints, found a maximum of 2,105 candidate rows
for ⿰. Each candidate belongs to one indexed range per direction; a self edge
is counted in both ranges before UNION deduplication. Thus added candidate
visits are bounded by 2,105 for this artifact, even when no notes are returned.
This is a data-dependent bound and must be recomputed on data changes.

The table compares `select=kdpv` against `select=kdpv&select=kdpv_comment`, and
complete full-response SQL before/after. Separate `unihan_rs` calls retain
their prior work. SQLite VM/fullscan steps are scaling evidence, not D1 billing.

| Input | Comment records | KDPV fullscan steps, before → after | KDPV VM steps, before → after | Full response fullscan steps, before → after | Full response VM steps, before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| 充 | 1 | 0 → 0 | 329 → 458 | 64245 → 64245 | 3376995 → 3377124 |
| 𠑽 | 1 | 0 → 0 | 323 → 443 | 24947 → 24947 | 2691321 → 2691441 |
| 杼 | 3 | 0 → 0 | 346 → 575 | 64245 → 64245 | 3375965 → 3376194 |
| 脚 | 1 | 0 → 0 | 543 → 702 | 64245 → 64245 | 3377805 → 3377964 |
| ⿰ | 0 | 0 → 0 | 75887 → 86475 | 24947 → 24947 | 2759712 → 2770300 |
| A | 0 | 0 → 0 | 69 → 132 | 24947 → 24947 | 2684054 → 2684117 |
| 𱍐 | 0 | 0 → 0 | 49 → 92 | 64245 → 64245 | 3366864 → 3366907 |
| 脚󠄀 | 1 | 0 → 0 | 119 → 223 | 64245 → 64245 | 3366862 → 3366966 |
| (empty) | 0 | 0 → 0 | 69 → 132 | 24947 → 24947 | 2683890 → 2683952 |

The public endpoint rejects empty/IVS query inputs as before; those rows
characterize the DB method. The 脚 base input demonstrates inclusion of an IVS
endpoint. Forward/reverse, self edges, distinct and identical comments,
null/empty comments, unrelated edges, full responses, selection exclusion and
indexed plans are covered by local tests. All 47 tests across better-sqlite3,
default Node, sql.js and mocked D1 conformance pass, along with the selected
SQL executor test file and core/facade/D1/better-sqlite3 TypeScript checks.
No search registrations, IDS work, Unicode generation, imports or DB writes
are changed. Broad/no-hit searches and graph frontier/depth retain prior SQL.

Only local implementation/verification is allocated in this review. Remote
validation, deployment, retries, rollback and import have zero reads/writes
allocated. Account usage was not queried: the complete daily Free allowance
is conservatively allocated to existing use plus remaining normal traffic
across every database, leaving no spare remote quota. This is a conservative
allocation, not a measurement of account usage or a remote execution permit.

For a future code-only rollout, reuse the DB, verify the artifact/comments/
indexes, refresh aggregate usage and budget the entire workload, validation,
retries and rollback before execution. Stop on missing indexes, unknown cost
or usage, or a budget that cannot fit. Roll back code without DB import.
No remote scans/imports/benchmarks may be used to resolve those unknowns.
