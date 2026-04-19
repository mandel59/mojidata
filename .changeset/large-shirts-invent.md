---
"@mandel59/mojidata-api": major
"@mandel59/mojidata-api-runtime": major
"@mandel59/mojidata-api-better-sqlite3": minor
"@mandel59/mojidata-api-node-sqlite": minor
---

Move the native Node.js backends out of the portable `mojidata-api` runtime and
compatibility facade.

`@mandel59/mojidata-api` and `@mandel59/mojidata-api-runtime` now keep the
default `sql.js` path only, while the native backends are published as the new
explicit packages `@mandel59/mojidata-api-better-sqlite3` and
`@mandel59/mojidata-api-node-sqlite`.
