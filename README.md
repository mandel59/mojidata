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
