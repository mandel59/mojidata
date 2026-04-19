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

For Node.js, `createNodeDb()` defaults to `sql.js`, but it can also use
`better-sqlite3`:

```ts
import { createNodeDb } from "@mandel59/mojidata-api-runtime"

const db = createNodeDb({ backend: "better-sqlite3" })
```

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

Use `yarn bench` to measure representative API scenarios without starting an HTTP server.
By default it benchmarks `createNodeApp()` in-process with the `sql.js` backend, which reduces
transport noise and makes before/after comparisons easier.

```sh
yarn bench
```

On a fresh clone or a clean CI runner, prepare the benchmark dependencies first:

```sh
yarn bench:prepare
```

Select a local backend explicitly when comparing executor implementations:

```sh
yarn bench --backend sqljs
yarn bench --backend better-sqlite3
```

You can also target an already-running server for end-to-end HTTP measurements:

```sh
yarn dev
MOJIDATA_API_BASE_URL=http://localhost:3001 yarn bench --base-url http://localhost:3001
```

To save machine-readable results while keeping the table output on stdout:

```sh
yarn bench --backend better-sqlite3 --output ./tmp/better-sqlite3.json
```

To compare two saved benchmark runs:

```sh
yarn bench --backend sqljs --output ./tmp/sqljs.json
yarn bench --backend better-sqlite3 --output ./tmp/better-sqlite3.json
yarn bench:compare ./tmp/sqljs.json ./tmp/better-sqlite3.json
```

Remote deployments can be compared the same way:

```sh
yarn bench --base-url https://example.invalid --label worker-d1 --output ./tmp/worker-d1.json
yarn bench:compare ./tmp/better-sqlite3.json ./tmp/worker-d1.json
```

Supported options:

- `--backend <sqljs|better-sqlite3>`: choose the local in-process backend
- `--iterations <n>`: measured iterations per scenario (`30` by default)
- `--warmup <n>`: warmup iterations per scenario (`5` by default)
- `--cold <n>`: cold-start iterations per scenario (`3` by default, in-process only)
- `--scenario <name>`: run only the named scenario, repeatable
- `--format <table|json>`: switch between human-readable and machine-readable output
- `--label <name>`: override the benchmark target label, useful for remote deployments
- `--output <path>`: write JSON results to a file for later comparison

There is also a manual GitHub Actions workflow, `Mojidata API Benchmark`, which runs
the `sql.js` and `better-sqlite3` benchmarks on GitHub-hosted runners and uploads
the JSON outputs plus comparison artifacts. The workflow also accepts an optional
remote base URL so a deployed Worker target can be benchmarked with the same scenario set.

Current built-in scenarios:

- `mojidata-basic`
- `mojidata-select`
- `ivs-list`
- `mojidata-variants`
- `idsfind-ids`
- `idsfind-property`

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
