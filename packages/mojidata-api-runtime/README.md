# mojidata-api-runtime

`@mandel59/mojidata-api-runtime` provides backend-neutral runtime helpers for
`mojidata-api`.

## Exports

- `createMojidataApiWorkerClient()`: browser worker client helper
- worker protocol types used by browser/client integrations
- low-level shared utility modules under `lib/*`

This package is no longer the place that chooses a concrete database backend.

Use an explicit backend package instead:

- `@mandel59/mojidata-api-sqljs`
- `@mandel59/mojidata-api-better-sqlite3`
- `@mandel59/mojidata-api-node-sqlite`
