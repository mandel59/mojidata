# Mojidata API

This package can run in both:
- Node.js (HTTP server via Hono)
- Browser (Hono `app.fetch` + SQL.js running in a WebWorker)

## Tests

Integration tests live under `tests/` and call the running API server.

- Default base URL: `http://localhost:3001`
- Override with: `MOJIDATA_API_BASE_URL=http://localhost:3001 yarn test`

If you need to start the dev server: `yarn dev`

## Browser usage (WebWorker)

`mojidata-api` needs these URLs at runtime:
- `sqlWasmUrl`: URL to `sql.js`'s `sql-wasm.wasm`
- `mojidataDbUrl`: URL to `moji.db`
- `idsfindDbUrl`: URL to `idsfind.db`

The exact way to obtain asset URLs depends on your bundler. For example, with Vite:

```ts
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url"
import { createApp } from "@mandel59/mojidata-api/app"
import { createMojidataApiWorkerClient } from "@mandel59/mojidata-api/browser-client"

const worker = new Worker(
  new URL("@mandel59/mojidata-api/browser-worker", import.meta.url),
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
