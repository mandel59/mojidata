---
"@mandel59/mojidata-api": minor
"@mandel59/mojidata-api-runtime": minor
---

Add a Node.js `node:sqlite` backend for `mojidata-api` and expose it through
`createNodeDb({ backend: "node:sqlite" })`.

The runtime package now exports the built-in SQLite adapter, the compatibility
facade forwards the new backend option and wrapper entry points, and the
benchmark tooling compares `node:sqlite` with `sql.js` and `better-sqlite3`.
