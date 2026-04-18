# Releasing

## Required GitHub configuration

`GITHUB_TOKEN` is provided by GitHub Actions and is used by `changesets/action` to create or update the release pull request.

## Required npm configuration

- Configure npm Trusted Publishers for each publishable `@mandel59/*` package in this repository.
- Point each package at this repository and the `release.yml` workflow filename.
- Use GitHub-hosted runners. npm Trusted Publishing does not support self-hosted runners.

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

- `id-token: write` is required because npm Trusted Publishing uses GitHub Actions OIDC.
- The release workflow uses Node.js 24 so npm meets Trusted Publishing's current runtime requirements.
- `packages/mojidata` build artifacts are restored from cache before release work to reduce repeated DB rebuild cost.
- The release workflow writes either the "trusted publishing executed" or the "release PR updated" outcome into the GitHub Actions job summary.
