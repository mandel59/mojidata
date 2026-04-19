# mojidata-api-d1

`@mandel59/mojidata-api-d1` provides the initial Cloudflare D1 integration
package for `mojidata-api`.

It currently includes:

- `createD1Executor()`: a `SqlExecutor` adapter for a D1 binding
- `createD1Db()`: bind `mojidata-api-core` to two D1 databases
- `createD1App()`: create a Hono app backed by D1 bindings

Named SQL parameters are rewritten to ordered placeholders because Cloudflare D1
currently supports ordered and anonymous parameters, but not named parameters,
via the Worker Binding API.

Example:

```ts
import { createD1App } from "@mandel59/mojidata-api-d1"

export default {
  fetch(request: Request, env: { MOJIDATA_DB: unknown; IDSFIND_DB: unknown }) {
    const app = createD1App({
      mojidataDb: env.MOJIDATA_DB as any,
      idsfindDb: env.IDSFIND_DB as any,
    })
    return app.fetch(request, env)
  },
}
```

This package is still an initial D1 PoC. Full parity for all mojidata-api
queries still depends on follow-up work around custom SQL function usage, FTS
compatibility, and D1 data import flow.

For a deployable Cloudflare Worker target in this repository, see the private
workspace
[packages/mojidata-api-d1-worker](/Users/mandel59/ws/mojidata/packages/mojidata-api-d1-worker)
and
[docs/mojidata-api-d1-deployment.md](/Users/mandel59/ws/mojidata/docs/mojidata-api-d1-deployment.md).

For local D1-oriented `idsfind` assets, use the separate `@mandel59/idsdb-fts5`
package:

```sh
corepack yarn workspace @mandel59/idsdb-fts5 prepare
```

## Preparing SQL dumps for D1 import

Cloudflare D1 imports SQL files, not raw `.db` artifacts. In this monorepo, you
can prepare importable SQL dumps for both mojidata and the FTS5 `idsfind`
database with:

```sh
corepack yarn mojidata-api:d1:prepare-import
```

By default this writes the converted dumps into
`/tmp/mojidata-d1-import/`:

- `mojidata.sql`
- `idsdb-fts5.sql`
- `manifest.json`

To write them somewhere else:

```sh
corepack yarn mojidata-api:d1:prepare-import --output-dir ./tmp/d1-import
```

Those `.sql` files can then be imported with Wrangler, for example:

```sh
npx wrangler d1 execute MOJIDATA_DB --remote --file ./tmp/d1-import/mojidata.sql
npx wrangler d1 execute IDSFIND_DB --remote --file ./tmp/d1-import/idsdb-fts5.sql
```

## Benchmarking a deployed D1 target

Once a Worker backed by `createD1App()` is deployed, compare it against the
local backends with:

```sh
corepack yarn mojidata-api:bench:remote \
  --base-url https://example.com \
  --label worker-d1 \
  --output-dir artifacts/bench/worker-d1
```

This saves the remote benchmark JSON plus fresh local baseline runs in one
directory, along with comparison files for:

- `sql.js` vs D1
- `better-sqlite3` vs D1
- `node:sqlite` vs D1

For more detail, see
[docs/mojidata-api-benchmarks.md](/Users/mandel59/ws/mojidata/docs/mojidata-api-benchmarks.md).
