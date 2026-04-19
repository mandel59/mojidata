# mojidata-api-sqljs

`@mandel59/mojidata-api-sqljs` provides the explicit `sql.js` backend for
`mojidata-api`.

Install this package when you want the portable `sql.js` backend for Node.js or
browser-worker usage.

```ts
import { createSqlJsApp, createSqlJsDb } from "@mandel59/mojidata-api-sqljs"

const db = createSqlJsDb()
const app = createSqlJsApp()
```

Browser worker entrypoint:

```ts
new Worker(new URL("@mandel59/mojidata-api-sqljs/browser-worker", import.meta.url), {
  type: "module",
})
```
