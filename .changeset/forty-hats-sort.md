---
"@mandel59/mojidata-api": minor
"@mandel59/mojidata-api-core": minor
"@mandel59/mojidata-api-hono": minor
"@mandel59/mojidata-api-runtime": minor
"@mandel59/mojidata-api-sqljs": minor
---

Release the split `mojidata-api` packages as `1.8.0`.

This release finalizes the backend abstraction and package split work:

- add the standalone `@mandel59/mojidata-api-core`, `-sqljs`, `-hono`, and `-runtime` packages
- keep `@mandel59/mojidata-api` as a compatibility facade over the split packages
- ship the `dist/`-based build outputs and compatibility subpath exports
- add `better-sqlite3` backend support and backend-neutral test coverage
