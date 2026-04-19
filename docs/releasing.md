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
- `@mandel59/mojidata-api-hono`
- `@mandel59/mojidata-api-runtime`
- `@mandel59/mojidata-api-better-sqlite3`
- `@mandel59/mojidata-api-node-sqlite`
- `@mandel59/mojidata-api-d1`

For the D1-oriented IDS database package, use the same bootstrap flow for:

- `@mandel59/idsdb-d1`

## Normal flow

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
