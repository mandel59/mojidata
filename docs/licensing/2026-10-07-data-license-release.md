# Data license patch release preparation

Related: #80. Release PR: [#82](https://github.com/mandel59/mojidata/pull/82).
Reviewed on 2026-10-07 JST against main
`0c9ef0d720c15515f5a78c8f88124c5a63f70b09`.

The Changesets-generated PR applies the two consolidated license changesets:

- `@mandel59/mojidata`: 1.9.1 → 1.9.2.
- `@mandel59/idsdb`: 1.8.0 → 1.8.1.
- `@mandel59/idsdb-fts5`: 1.10.0 → 1.10.1.
- `@mandel59/idsdb-bvec`: 0.2.0 → 0.2.1.

The corresponding changelogs describe the reviewed notice and provenance
changes. The two consumed changesets are removed. The IDS dev dependency on
Mojidata becomes `^1.9.2`; the private benchmark's dependency on idsdb-fts5
becomes `^1.10.1`. Matching workspace descriptors are refreshed in `yarn.lock`.
No other manifest field changes, and all external lockfile blocks are identical
to main. There are no source, notice, dataset, SQL, index, runtime or workflow
edits in this release PR.

Local validation confirms the four planned patch versions, the two workspace
range updates, unchanged normalized build manifests and unchanged external
lockfile blocks. All five DB fingerprint tests and the license registry and
generated-notice check pass. Offline `yarn install --immutable --mode=skip-build`
passes without changing the lockfile. Yarn removed four cached packages for
other platforms locally; those unrelated deletions were restored.

Package versions and workspace dependency ranges are excluded from DB build
fingerprints by `scripts/db_build_inputs.py`, so this versioning step does not
invalidate database inputs. License implementation and archive validation were
already completed in [#81](https://github.com/mandel59/mojidata/pull/81), whose
remote Validate and main Release checks passed.

Incremental account-wide D1 reads and writes remain zero, including retries.
This preparation only changes release metadata and uses local/GitHub/npm
operations; the Release workflow has no D1 query, import or Worker deployment.
No live usage probe is needed for a zero-row operation; traffic reserves are
untouched. This record grants no quota to a later remote deployment.

The release PR must pass Validate before merging. After a later merge, the
normal Release workflow gates npm publishing on builds, the full test suite
and package/archive checks. Stop on unexpected dependency or source changes,
failed notice checks, stale quota fingerprints or failed CI. Correct/revert the
release metadata before publishing if needed; no database rollback is required.
