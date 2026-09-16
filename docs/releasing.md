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
changes and the matching lockfile; validation still uses `yarn install --immutable`.

1. Merge feature pull requests with a normal or empty changeset.
2. Wait for the `Release` workflow on `main` to create or update the release pull request.
3. Review the generated version and changelog updates in that release pull request.
4. Merge the release pull request after CI passes.
5. Confirm the follow-up `Release` workflow run executed the trusted publishing step successfully.
6. Check the workflow job summary and publish step logs.

## Manual flow

Use the `workflow_dispatch` trigger on the `Release` workflow when you need to retry release PR creation or publishing without pushing a new commit to `main`.

## Notes

- The `Validate` workflow runs for pull requests and direct pushes to `develop`. Direct pushes to `main` are checked inside the `Release` workflow to avoid duplicate `test` and `pack` runs.
- `id-token: write` is required because npm Trusted Publishing uses GitHub Actions OIDC.
- The release workflow uses Node.js 24 so npm meets Trusted Publishing's current runtime requirements.
- `packages/mojidata` build artifacts are restored from cache before release work to reduce repeated DB rebuild cost.
- The release workflow writes either the "trusted publishing executed" or the "release PR updated" outcome into the GitHub Actions job summary.

## CI for documentation changes

Release and Validate classify the complete event diff before installing packages
or preparing databases. Changes confined to `docs/`, the root `README.md`, and
`AGENTS.md` skip DB preparation, workspace builds, tests, packing and automatic
release work. The lightweight classification tests still run and Actions shows
the decision in its summary. The required `validate` check completes explicitly
and fails if classification or required validation fails.

Package documentation and licenses, `.changeset/`, dependency metadata, workflow
files and unknown paths still run the normal checks. Push comparisons use the
whole before/after range; PR comparisons use the merge base. Missing history,
new branches, malformed events and empty comparisons conservatively run checks.
Manual `workflow_dispatch` runs always enable release checks, even if the last
commit changed only documentation, so a failed publish can still be retried.

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

Both CI jobs cache all three index variants. The preparation job writes per-phase
elapsed times and exact cache-match results to the Actions summary; a non-exact
match can still restore an older cache whose inputs are checked locally.
