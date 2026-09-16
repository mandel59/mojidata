# Releasing

## Required GitHub configuration

`GITHUB_TOKEN` is provided by GitHub Actions and is used by `changesets/action` to create or update the release pull request.

## Required npm configuration

- Configure npm Trusted Publishers for each publishable `@mandel59/*` package in this repository.
- Point each package at this repository and the `release.yml` workflow filename.
- Use GitHub-hosted runners. npm Trusted Publishing does not support self-hosted runners.

## First publish for new packages

If a package has never been published to npm before, create its registry entry before relying on the automated release workflow.

1. Run a dry-run from the workspace:
   `corepack yarn workspace @scope/package npm publish -n --access public`
2. Publish the package manually once with `--access public`.
3. Open the package on npmjs.com and configure its Trusted Publisher entry for this repository and `release.yml`.
4. After that bootstrap publish, let subsequent releases go through the GitHub Actions `Release` workflow.

For the split `mojidata-api` packages, use this bootstrap flow for:

- `@mandel59/mojidata-api-core`
- `@mandel59/mojidata-api-sqljs`
- `@mandel59/mojidata-api-sqlite-wasm`
- `@mandel59/mojidata-api-hono`
- `@mandel59/mojidata-api-runtime`
- `@mandel59/mojidata-api-better-sqlite3`
- `@mandel59/mojidata-api-node-sqlite`
- `@mandel59/mojidata-api-d1`

For the FTS5 IDS database package, use the same bootstrap flow for:

- `@mandel59/idsdb-fts5`

## Normal flow

`yarn version-packages` applies Changesets and refreshes `yarn.lock` without
running builds. The generated release PR must include both package manifest
changes and the matching lockfile; Release uses `yarn install --immutable`.

1. Merge feature pull requests with a normal or empty changeset.
2. Wait for the `Release` workflow on `main` to create or update the release pull request.
3. Review the generated version and changelog updates in that release pull request.
4. Merge the release pull request after CI passes.
5. Confirm the follow-up `Release` workflow run executed the trusted publishing step successfully.
6. Check the workflow job summary and publish step logs.

## Manual flow

Use the `workflow_dispatch` trigger on the `Release` workflow when you need to retry release PR creation or publishing without pushing a new commit to `main`.

## Notes

- `Validate` runs only dependency-free CI control checks on PRs and `develop`. It does not install workspace dependencies, generate databases, or run application tests. Full validation gates npm publishing in `Release`.
- `id-token: write` is required because npm Trusted Publishing uses GitHub Actions OIDC.
- The release workflow uses Node.js 24 so npm meets Trusted Publishing's current runtime requirements.
- `packages/mojidata` build artifacts are restored from cache before release work to reduce repeated DB rebuild cost.
- The release summary distinguishes an actual release PR update, empty changesets
  without a PR update, publishing success, and incomplete/failed release steps.
  A successful publishing command can still mean no unpublished versions existed.

## CI policy

PRs and `develop` pushes run one lightweight `validate` job: CI control-script
regressions and database fingerprint tests, without dependency installation or DB
preparation. This deliberately allows application failures to reach main; the
full suite is required before publishing, not before merging each development PR.

On main, Release first handles Changesets. Updating a release PR (or encountering
only empty changesets) does not run builds, application tests or packing. If no
changesets remain, it queries npm for the exact public workspace versions. If all
are already published, it skips heavy checks and publishing. Registry failures
stop the workflow instead of being treated as an empty release.

When unpublished versions exist, one job restores caches, prepares all DB variants,
builds the workspace, runs the full test suite, checks packages, and finally runs
`changeset publish`. Failure in any earlier step prevents publishing. Build and
validation use the same checkout and filesystem; there is no additional root
build between package validation and publishing. Local `yarn release` retains its
build step for standalone use. Partial publishing failures can be retried: already
published versions are excluded by Changesets.

Release skips dependency installation and release planning for changes confined
to `docs/`, the root `README.md`, and `AGENTS.md`. Other paths use the release flow
above. Missing history, new branches and unknown diffs conservatively enable
release planning. Manual `workflow_dispatch` always enables planning and retries,
including after documentation-only commits; it still skips heavy checks if npm
has no pending versions.

## Database cache inputs

Actions cache keys and local DB stamps use `scripts/db_build_inputs.py` to
normalize package metadata. Release versions, descriptions and local workspace
version ranges do not invalidate the DB cache. Build commands, external
dependency requirements, external lockfile resolutions/checksums, Yarn patches,
Node/Python versions and source/build inputs remain part of the fingerprint.
The immutable install check still rejects manifests that disagree with the lock.
Changes to unrelated external dependencies can conservatively invalidate caches.

Actions computes source-based keys before restoring artifacts; local prepare
scripts additionally check generated inputs (including the actual mojidata DB
for IDS builds) before deciding to skip. PR caches follow GitHub's cache scope:
a PR-created cache must not be assumed available to a subsequent main run.

## Shared IDS database preparation

`node scripts/prepare-ci-databases.mjs` prepares mojidata, IDS utilities, FTS4,
FTS5 and bvec in that order. When the FTS4 input stamp matches the current
sources and transformation options, FTS5 and bvec reuse its expanded IDS rows
and decomposition database and build only their own search indexes. Custom
recipes, missing or stale base artifacts and incompatible options fall back to
the full builder. Each output retains its own input stamp.

The release job caches all three index variants and writes per-phase
elapsed times and exact cache-match results to the Actions summary; a non-exact
match can still restore an older cache whose inputs are checked locally.

`scripts/run-ci-phase.mjs` records elapsed time and exit status for Release's
build/test/pack/version/publish commands, including failures. Test timings include
nested package builds; further deduplication within test commands remains in #59.
