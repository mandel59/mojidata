# mojidata-api-runtime

`@mandel59/mojidata-api-runtime` provides the default Node.js composition helpers for
`mojidata-api`.

## Exports

- `createNodeDb()`: create the default mojidata API database composition for Node.js
- `createNodeApp()`: create the Hono app bound to that database composition
- `createMojidataApiWorkerClient()`: browser worker client helper

## Default Node backend

`createNodeDb()` in this package uses the portable `sql.js` backend.

Example:

```ts
import { createNodeDb } from "@mandel59/mojidata-api-runtime"

const sqljsDb = createNodeDb()
```

Native Node backends are published separately so the portable runtime does not
pull them into default install and bundle paths:

- `@mandel59/mojidata-api-better-sqlite3`
- `@mandel59/mojidata-api-node-sqlite`
