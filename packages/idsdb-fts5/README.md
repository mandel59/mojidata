# Mojidata IDS DB FTS5

`@mandel59/idsdb-fts5` provides an FTS5-flavored `idsfind.db` for mojidata
backends that can use SQLite FTS5.

It is separate from `@mandel59/idsdb`, which remains the default FTS4 package
used by the existing `sql.js`-based consumers.

This package is intended for backends such as:

- `better-sqlite3`
- `node:sqlite`
- Cloudflare D1

For local regeneration inside this monorepo:

```sh
corepack yarn workspace @mandel59/idsdb-fts5 prepare
```

## License

[MIT](./LICENSE.md)
