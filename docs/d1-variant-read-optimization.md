# D1 variant query read reduction (#65)

The variant API previously materialized every relation before filtering the
current traversal frontier. Each strong-edge expansion repeated those scans.
Removing `MATERIALIZED` alone did not remove the expensive scans through Unihan
aggregate views and the MJ union view.

The new queries filter normalized Unihan tables by indexed source UCS values.
`unihan_value_ref` supplies reverse-lookup candidates; the final relation predicate
still checks exact endpoints. Latin-1 and multi-code-point inputs retain a full
Unihan fallback because that candidate index does not cover them completely.
MJ mappings use separate forward/reverse indexed lookups and reuse one small
materialized source set. Other relation sources filter both endpoints before
materialization. Small UNION groups comply with D1's runtime query limit.

No database migration, new index, or data reimport is needed for the current
mojidata 1.9.0 database. Graph expansion, weak relations and relation deduplication
are unchanged. Result ordering remains unspecified.

## Verification

- All real non-Latin-1 relation endpoints were compared with frozen original SQL.
- Every reverse Unihan edge was checked for candidate-index coverage.
- Recursive graph results matched for 14 cases including duplicate inputs,
  multiple characters, absent characters, Latin-1 and IVS input.
- Query plans avoid scans of source relation tables. Runtime SQL also executes
  with SQLite's compound SELECT limit set to 5 after loading the schema.
- Native SQLite, sql.js and node:sqlite return the expected variant graph; D1
  executor/API tests and the existing graph semantics tests pass.

## Measurements (2026-09-17 JST)

The input for the following measurements is one frontier containing `漢` and `漢`.
These are per-query measurements, not the total cost of recursive API traversal.

| Query group | Old local full-scan steps | New local full-scan steps | Old local VM steps | New local VM steps | New D1 rows read | New D1 SQL ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unihan/MJ/nyukan | 244,140 | 118 | 6,783,140 | 3,298 | 401 | 3.3097 |
| Common-use/CJKVI | 3,136 | 0 | 40,126 | 299 | 39 | 0.8997 |
| JIS/TGHB | 18,093 | 1 | 212,815 | 349 | 46 | 0.7862 |

Local statistics use SQLite 3.45.1 on the same input and database for both SQL
versions. Remaining full-scan steps visit small filtered intermediates. They are
not equivalent to D1's `rows_read` billing metric.

D1 measurements used the existing live Unicode 18 mojidata DB via read-only
queries, once per successfully compiled query. All reported `rows_written: 0`
and `changed_db: false`. Earlier syntax-only attempts exposed D1's compound SELECT
limit and were corrected before these measurements. No repeated remote benchmark
or old full-scan SQL was run. The old D1 Insights average of 233,628 rows for the
first group aggregates different executions and is not a same-input measurement.

These checks validate SQL execution on D1. The Worker rollout completed on
2026-09-17 JST; see the [deployment record](deployments/2026-09-17-variant-read-optimization.md).
A full HTTP smoke check after quota recovery remains pending; this change does
not restore already-consumed daily quota.
