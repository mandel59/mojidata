# Mojidata IDS DB

This package provides the prebuilt SQLite databases used by the IDS tools.

By default `yarn prepare` rebuilds `idsfind.db` with an FTS4 index for the
existing local SQLite consumers.

For Cloudflare D1 experiments, `yarn prepare:d1` rebuilds the same `idsfind.db`
with an FTS5 index instead. This is intended as a local asset-generation step
for D1 import flows.

## License

[MIT](./LICENSE.md)
