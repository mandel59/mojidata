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

On pull requests, CI also runs `yarn changeset status`, so changes to publishable packages are expected to include either a real changeset or an explicit empty changeset.
