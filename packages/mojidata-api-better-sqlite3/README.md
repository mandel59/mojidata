# mojidata-api-better-sqlite3

`@mandel59/mojidata-api-better-sqlite3` provides the `better-sqlite3` backend for
`mojidata-api`.

Install this package only when you explicitly want the native `better-sqlite3`
backend in a Node.js environment.

```ts
import { createBetterSqlite3App, createBetterSqlite3Db } from "@mandel59/mojidata-api-better-sqlite3"

const db = createBetterSqlite3Db()
const app = createBetterSqlite3App()
```
