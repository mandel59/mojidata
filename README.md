# Mojidata Workspace

## Packages

- [Mojidata Character Database](packages/mojidata)
- [Mojidata CLI](packages/mojidata-cli)
- [Mojidata IDS Tools](packages/idstool)

## Build

```
yarn && yarn build
```

## CI

- `yarn ci:build`: build all workspace packages
- `yarn ci:test`: run the repository test suite used in CI

`react-mojidata-api` browser integration tests are not part of the default CI path. The standard CI flow uses the in-process/unit test paths.

## Release

- `yarn changeset`: create a release note for changed packages
- `yarn version-packages`: apply pending changesets to package versions and changelogs
- `yarn release`: build the workspace and publish packages through Changesets

GitHub Actions is the intended release path. The release workflow creates or updates a release PR on `main`, and publishes after that PR is merged with `NPM_TOKEN` configured in repository secrets.

On pull requests, CI also runs `yarn changeset status`, so changes to publishable packages are expected to include either a real changeset or an explicit empty changeset. This check is skipped for the Changesets-generated `changeset-release/*` release PR branch.

### Release Policy

- All workspace packages under `packages/*` are treated as publishable by Changesets.
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
