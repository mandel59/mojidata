# Mojidata Workspace

## Packages

- [Mojidata Character Database](packages/mojidata)
- [Mojidata CLI](packages/mojidata-cli)
- [Mojidata IDS Tools](packages/idstool)
- [Mojidata API compatibility facade](packages/mojidata-api)
- [Mojidata API runtime](packages/mojidata-api-runtime)
- [Mojidata API better-sqlite3 backend](packages/mojidata-api-better-sqlite3)
- [Mojidata API node:sqlite backend](packages/mojidata-api-node-sqlite)

## Build

```
yarn && yarn build
```

## CI

- `yarn ci:build`: build all workspace packages
- `yarn ci:build:affected`: build only affected workspaces and their dependencies for a pull request base SHA
- `yarn ci:pack`: run publish dry-runs for all publishable workspace packages
- `yarn ci:pack:affected`: run publish dry-runs only for affected publishable packages
- `yarn ci:test`: run the repository test suite used in CI
- `yarn ci:test:affected`: run only affected package tests for a pull request base SHA

`react-mojidata-api` browser integration tests are not part of the default CI path. The standard CI flow uses the in-process/unit test paths.

The `Validate` workflow uses the affected-package path for pull requests and the full path for direct pushes to `develop`.
Direct pushes to `main` are validated by the `Release` workflow before it creates or updates a release pull request or publishes packages.
CI sets `NO_UPDATE_NOTIFIER=1` so AVA's update-check does not emit sandbox or permission noise.

## Benchmarks

- `yarn mojidata-api:bench:prepare`: prepare the local benchmark dependencies for `mojidata-api`
- `yarn mojidata-api:bench --backend sqljs`: benchmark the `sql.js` backend locally
- `yarn mojidata-api:bench --backend better-sqlite3`: benchmark the `better-sqlite3` backend locally
- `yarn mojidata-api:bench --backend node:sqlite`: benchmark the `node:sqlite` backend locally
- `yarn mojidata-api:bench:local`: run the local backends and save a comparison bundle
- `yarn mojidata-api:bench:compare <baseline.json> <candidate.json>`: compare two saved benchmark runs

The benchmark tooling lives in the private workspace `@mandel59/mojidata-api-bench`, not in the published `@mandel59/mojidata-api` compatibility facade.
The native Node.js backends are now published as explicit packages instead of being part of the default portable runtime/facade install path.
See [docs/mojidata-api-benchmarks.md](/Users/mandel59/ws/mojidata/docs/mojidata-api-benchmarks.md) for the baseline, branch comparison, and remote target workflows.

## Release

- `yarn changeset`: create a release note for changed packages
- `yarn version-packages`: apply pending changesets to package versions and changelogs
- `yarn release`: build the workspace and publish packages through Changesets

GitHub Actions is the intended release path. The release workflow creates or updates a release PR on `main`, and after that PR is merged it publishes through npm Trusted Publishing on GitHub-hosted runners.
When the publish path runs, the workflow writes that outcome into the GitHub Actions job summary.

On pull requests, CI also runs `yarn changeset status`, so changes to publishable packages are expected to include either a real changeset or an explicit empty changeset. This check is skipped for the Changesets-generated `changeset-release/*` release PR branch.

### Release Policy

- All workspace packages under `packages/*` are treated as publishable by Changesets except explicitly private/internal workspaces such as `@mandel59/mojidata-api-bench`.
- Use a normal changeset when a change affects a published package's runtime behavior, API surface, CLI behavior, package metadata, or release notes.
- Use an empty changeset for CI/CD, workflow, repository policy, or documentation changes that should pass the release gate without bumping package versions.
- The compatibility facade package `@mandel59/mojidata-api` remains publishable and should continue to receive changesets when its published surface or package metadata changes.

### Release Checklist

1. Merge feature PRs with appropriate changesets.
2. Let the release workflow update or create the release PR on `main`.
3. Review generated version and changelog updates in that release PR.
4. Merge the release PR after CI passes.
5. Confirm npm publish succeeded from the Actions run.

See [docs/releasing.md](/Users/mandel59/ws/mojidata/docs/releasing.md) for GitHub secret requirements and the manual retry flow.
