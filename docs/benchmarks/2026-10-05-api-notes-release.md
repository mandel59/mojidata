# API notes npm release metadata review — 2026-10-05 (JST)

[Version Packages PR #76](https://github.com/mandel59/mojidata/pull/76) failed
[Require current D1 quota evidence](https://github.com/mandel59/mojidata/actions/runs/37206089565/job/111473399174)
because its generated manifests/lockfile had no review in the PR diff. The
failure was reproduced locally before adding the metadata review. No runtime
or database regression caused this check failure.

The release branch was rebased onto main
`fc2f9bda821cd07205fe04aef8228c65f4a17bea`, retaining deployment records.

| Path | Verified changes against main |
| --- | --- |
| `packages/mojidata-api-core/package.json` | `version`: 1.10.2 → 1.11.0 |
| `packages/mojidata-api/package.json` | `version`: 3.0.0 → 3.1.0; core range: ^1.10.0 → ^1.11.0 |
| `packages/mojidata-api-bench/package.json` | core range: ^1.10.2 → ^1.11.0 |
| `yarn.lock` | two core dependency ranges and the grouped core descriptor, retaining local workspace resolution |

Parsed JSON equality was checked after applying only the listed manifest edits.
The lockfile was compared byte for byte after only three corresponding string
replacements. External package resolutions, checksums, scripts and exports are
unchanged. The PR also consumes the existing Changesets and adds changelog
entries. It does not change runtime sources, SQL, DB inputs, bindings or indexes.

The comparison baseline already includes the bounded reference-note queries.
Against the previously published npm package, those API features are new:
see the [MJ note review](../d1-quota-reviews/2026-10-04-mjsm-note.json),
[KDPV comment review](../d1-quota-reviews/2026-10-04-kdpv-comment.json) and
[deployed runtime verification](../deployments/2026-10-04-api-notes/README.md).
This metadata record does not waive their bounds or authorize client rollouts.

The [release workflow](../../.github/workflows/release.yml) builds, tests and
packs locally before publishing to npm. It does not query/import D1 or deploy
Workers. Aggregate D1 work for this fix, publishing, validation and retries is
zero reads and zero writes; live quota measurements are not needed for this
operation. A later web-app/Worker rollout needs its own applicable review.

Validation: the PR-wide quota gate passes with the current review; 52 existing
quota gate, CI control-script and D1 import-planning tests passed, as did all
5 DB cache fingerprint tests. Tests that invoke child processes were rerun
outside the restricted sandbox using the same Node command as CI. Stop on a
stale fingerprint, unexpected dependency/source diff or failing required check.
