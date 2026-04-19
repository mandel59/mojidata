# mojidata-api-node-sqlite

`@mandel59/mojidata-api-node-sqlite` provides the built-in `node:sqlite` backend
for `mojidata-api`.

Install this package when you explicitly want the `node:sqlite` backend in a
Node.js environment.

```ts
import { createNodeSqliteApp, createNodeSqliteDb } from "@mandel59/mojidata-api-node-sqlite"

const db = createNodeSqliteDb()
const app = createNodeSqliteApp()
```
