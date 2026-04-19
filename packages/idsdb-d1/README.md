# Mojidata IDS DB for D1

`@mandel59/idsdb-d1` provides an FTS5-flavored `idsfind.db` for Cloudflare D1
import flows.

It is separate from `@mandel59/idsdb`, which remains the default FTS4 package
used by the existing local SQLite consumers.

For local regeneration inside this monorepo:

```sh
corepack yarn workspace @mandel59/idsdb-d1 prepare
```

## License

[MIT](./LICENSE.md)
