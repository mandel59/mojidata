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

The shared builder uses 4096-byte SQLite pages by default. Set
`MOJIDATA_IDSDB_PAGE_SIZE` to a supported power of two from 512 through 65536
to regenerate a different layout.

For the current compatibility report and the reason this remains a separate
package, see [docs/idsfind-fts-comparison.md](../../docs/idsfind-fts-comparison.md).

## License

[MIT](./LICENSE.md)
