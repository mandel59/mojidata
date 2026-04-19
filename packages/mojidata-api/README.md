# Mojidata API

`@mandel59/mojidata-api` is the compatibility facade for the split `mojidata-api` packages.
New compositions should prefer the split packages directly, but the legacy subpath entrypoints remain available.

This facade package can run in both:
- Node.js (HTTP server via Hono)
- Browser (Hono `app.fetch` + SQL.js running in a WebWorker)

It also has split packages for composing the API yourself:

- `@mandel59/mojidata-api-core`: backend-neutral SQL API composition
- `@mandel59/mojidata-api-hono`: Hono app wiring
- `@mandel59/mojidata-api-runtime`: Node defaults and worker client helpers
- `@mandel59/mojidata-api-sqljs`: `sql.js` executor and openers

The original `@mandel59/mojidata-api/*` subpath entrypoints remain available as compatibility facades and forward to the split packages.

For Node.js, `createNodeDb()` in this package uses the portable `sql.js` backend:

```ts
import { createNodeDb } from "@mandel59/mojidata-api-runtime"

const db = createNodeDb()
```

Native Node backends are published separately so installing `@mandel59/mojidata-api`
does not pull native SQLite concerns into the default path:

- `@mandel59/mojidata-api-better-sqlite3`
- `@mandel59/mojidata-api-node-sqlite`

## Tests

Tests live under `tests/`.

By default, they run against an in-process `createNodeApp()` instance, so no server startup is required:

```sh
yarn test
```

If you want to target an already-running server instead, set `MOJIDATA_API_BASE_URL`:

```sh
MOJIDATA_API_BASE_URL=http://localhost:3001 yarn test
```

If needed, start the dev server with:

```sh
yarn dev
```

## Benchmarks

Repository benchmark tooling lives in the private workspace
`@mandel59/mojidata-api-bench`, not in this published compatibility facade.

Use the workspace benchmark commands from the repository root:

```sh
yarn mojidata-api:bench:prepare
yarn mojidata-api:bench:local -- --scenario ivs-list --iterations 10
yarn mojidata-api:bench --backend sqljs
```

There is also a manual GitHub Actions workflow, `Mojidata API Benchmark`, for collecting
benchmark artifacts on GitHub-hosted runners.

## Browser usage (WebWorker)

`mojidata-api` needs these URLs at runtime:
- `sqlWasmUrl`: URL to `sql.js`'s `sql-wasm.wasm`
- `mojidataDbUrl`: URL to `moji.db`
- `idsfindDbUrl`: URL to `idsfind.db`

The exact way to obtain asset URLs depends on your bundler. For example, with Vite:

```ts
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url"
import { createApp } from "@mandel59/mojidata-api-hono"
import { createMojidataApiWorkerClient } from "@mandel59/mojidata-api/browser-client"

const worker = new Worker(
  new URL("@mandel59/mojidata-api-runtime/browser-worker", import.meta.url),
  { type: "module" },
)

const db = createMojidataApiWorkerClient(worker, {
  sqlWasmUrl: wasmUrl,
  mojidataDbUrl: "/assets/moji.db",
  idsfindDbUrl: "/assets/idsfind.db",
})
await db.ready

const app = createApp(db)

// Call in-browser (Hono `app.fetch`):
const url = new URL("/api/v1/mojidata?char=漢&select=UCS", "http://local")
const res = await app.fetch(new Request(url))
const body = await res.json()

// Cleanup when you're done:
db.terminate()
```

## Advanced composition

If you want to wire the API together yourself instead of using `createNodeDb()`, use the lower-level entry points:

```ts
import { createSqlApiDb } from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"
import { createMojidataDbProvider, createSqlJsExecutor, openDatabaseFromFile } from "@mandel59/mojidata-api-sqljs"

const getMojidataDb = createMojidataDbProvider(() =>
  openDatabaseFromFile(require.resolve("@mandel59/mojidata/dist/moji.db")),
)

const getIdsfindDb = async () =>
  createSqlJsExecutor(
    await openDatabaseFromFile(require.resolve("@mandel59/idsdb/idsfind.db")),
  )

const db = createSqlApiDb({ getMojidataDb, getIdsfindDb })
const app = createApp(db)
```
