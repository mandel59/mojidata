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

For local D1-oriented `idsfind` assets, rebuild `@mandel59/idsdb` with FTS5:

```sh
corepack yarn workspace @mandel59/idsdb prepare:d1
```
