# BabelStone provenance patch release

Related: #80. Implementation PR: [#84](https://github.com/mandel59/mojidata/pull/84).
Release PR: [#85](https://github.com/mandel59/mojidata/pull/85).
Reviewed on 2026-10-17 JST.

The generated release applies the BabelStone provenance changeset:

- `@mandel59/mojidata`: 1.9.2 → 1.9.3.
- `@mandel59/idsdb`: 1.8.1 → 1.8.2.
- `@mandel59/idsdb-fts5`: 1.10.1 → 1.10.2.
- `@mandel59/idsdb-bvec`: 0.2.1 → 0.2.2.

Changesets removes the consumed changeset, adds the four changelog entries,
updates the IDS dev dependency on Mojidata and the private benchmark dependency
on idsdb-fts5, and refreshes matching workspace descriptors in yarn.lock.
All five normalized build manifests and every external lockfile block are
identical to main. No dataset, source, SQL, index, import, request, or deployment
path changes in this release PR.

Local checks verify all planned versions, unchanged normalized build inputs,
all five DB fingerprint tests, and the license registry/generated notices.
Implementation validation and four archive notice checks are recorded in
[the notice review](2026-10-17-babelstone-provenance.md).
The release PR must pass Validate, and the ordinary main Release job must pass
builds, the full test suite, and package/archive validation before publishing.

These version and workspace-range changes are excluded from DB input hashes.
Local/GitHub/npm operations consume zero D1 rows read and written, including
retries. No account usage probe, remote import, query, migration, or Worker
deployment is needed or authorized. Stop on unexpected source or dependency
changes, stale fingerprints, or failing validation. Before publishing, correct
release metadata if needed; after publishing, fix notice errors in a subsequent
package release. No database rollback is required.
