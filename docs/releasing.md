# Releasing

## Required GitHub configuration

- `NPM_TOKEN`: npm token that can publish all `@mandel59/*` packages in this repository

`GITHUB_TOKEN` is provided by GitHub Actions and is used by `changesets/action` to create or update the release pull request.

## Normal flow

1. Merge feature pull requests with a normal or empty changeset.
2. Wait for the `Release` workflow on `main` to create or update the release pull request.
3. Review the generated version and changelog updates in that release pull request.
4. Merge the release pull request after CI passes.
5. Confirm the follow-up `Release` workflow run published packages successfully.

## Manual flow

Use the `workflow_dispatch` trigger on the `Release` workflow when you need to retry release PR creation or publishing without pushing a new commit to `main`.

## Notes

- `NPM_TOKEN` remains the active publish mechanism for this repository.
- `id-token: write` is enabled on the workflow so the repository can move to trusted publishing later without redesigning workflow permissions.
- `packages/mojidata` build artifacts are restored from cache before release work to reduce repeated DB rebuild cost.
