# mojidata-api-runtime

`@mandel59/mojidata-api-runtime` provides the default Node.js composition helpers for
`mojidata-api`.

## Exports

- `createNodeDb()`: create the default mojidata API database composition for Node.js
- `createNodeApp()`: create the Hono app bound to that database composition
- `createMojidataApiWorkerClient()`: browser worker client helper

## Node backends

`createNodeDb()` supports these local backends:

- `sqljs`: default portable backend
- `better-sqlite3`: native SQLite backend
- `node:sqlite`: built-in Node.js SQLite backend

Example:

```ts
import { createNodeDb } from "@mandel59/mojidata-api-runtime"

const sqljsDb = createNodeDb()
const betterSqlite3Db = createNodeDb({ backend: "better-sqlite3" })
const nodeSqliteDb = createNodeDb({ backend: "node:sqlite" })
```

The `node:sqlite` backend requires a Node.js release that includes the built-in
`node:sqlite` module. In practice, use Node.js `22.13+` or a newer current/LTS release.

`node:sqlite` is still marked experimental by Node.js at the time of writing, so
Node may emit an `ExperimentalWarning` when that backend is used.
