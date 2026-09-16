# CI database preparation measurements (2026-09-17)

Related: #59, #60.

Measured locally on WSL with Node.js 24.13.0 and Python 3.12.3 using
`node scripts/prepare-ci-databases.mjs`. The rebuild run used existing downloaded
source files but invalidated all DB input stamps after the builder changes.
The second run reused the resulting databases. These are preparation times,
excluding Actions checkout, install and cache transfer.

| Phase | Rebuild (seconds) | Unchanged inputs (seconds) |
| --- | ---: | ---: |
| mojidata | 50.87 | 0.62 |
| idsdb-utils | 2.40 | 2.25 |
| idsdb (FTS4 and shared decomposition) | 154.42 | 0.70 |
| idsdb-fts5 (derived index) | 3.00 | 0.71 |
| idsdb-bvec (derived index) | 5.37 | 0.71 |
| Total | 216.06 | 4.99 |

The derived FTS5 database matches the published `@mandel59/idsdb-fts5@1.10.0`
database in all 164,101 `idsfind` rows, all 164,101 `idsfind_ref` rows, build
metadata and semantics metadata. Sample FTS queries also match and SQLite
integrity checking passes. Both derived decomposition files are byte-identical
to the FTS4 base. Automated fixture tests compare independently generated FTS5
and bvec databases with their derived equivalents, including index contents.

Fingerprint regression tests cover metadata/workspace version-only changes
(reuse), dependency resolution and builder changes (invalidate). Reuse guard
tests cover missing/stale base files, differing source options and recipes.

The earlier Actions measurement in #59 used another machine and cannot be used
as a controlled before/after comparison with these local results. Follow-up work
in #59 still includes measurements of all four scenarios on the same runner,
build/test/pack/publish artifact reuse, and publishing preflight checks. The new
Actions preparation summary records phase timings and exact cache matches for
future comparisons. Documentation-only changes now bypass these phases entirely.
Regression tests cover event classification; the workflow explicitly completes
the required `validate` check even when heavy jobs are skipped.
