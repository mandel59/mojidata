# mojidata-api D1 deployment

This document tracks the current deployment shape for the Cloudflare D1 backend
of `mojidata-api` and the contract used by `mojidata-web-app`.

## Scope

The current target is a bounded D1 rollout path:

- stand up a minimal Cloudflare Worker backed by two D1 databases
- import `mojidata` and `idsfind` data from generated SQL dumps
- verify the core API routes remotely
- run a small remote benchmark against the deployed target
- point `mojidata-web-app` at this Worker via `MOJIDATA_API_BASE_URL`

The standalone Worker remains intentionally narrower than a fully embedded
Next.js integration. It is the first production-like target because D1 import,
query behavior, CORS, and benchmark regressions can be validated without also
debugging the OpenNext migration.

## Deployment shapes

There are two reasonable ways to consume `@mandel59/mojidata-api-d1` on
Cloudflare:

1. A standalone API Worker
2. A future `mojidata-web-app` deployment that embeds the D1-backed API logic in
   the app's own Worker runtime

The standalone API Worker is the first validation target because it gives us a
clean, minimal surface for checking D1 imports, route behavior, and benchmark
comparisons. It also remains reusable if `mojidata-web-app` later talks to a
separate API over HTTP.

The embedded-app shape matters because `mojidata-web-app` already uses
`mojidata-api` in-process on the server side for some routes and browser-worker
execution for desktop SPA routes. A future Cloudflare migration may prefer to
reuse the D1 backend package directly inside a Next.js Worker rather than keep a
separate API deployment.

## Free-plan feasibility

As of 2026-04-19, Cloudflare's published Free-plan limits are compatible with a
small D1 validation run:

- Workers Free: `100,000 requests/day`
- D1 Free: `5,000,000 rows read/day`
- D1 Free: `100,000 rows written/day`
- D1 Free: `10 databases/account`
- D1 Free: `500 MB` max per database
- D1 Free: `50` queries per Worker invocation

Sources:

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

The current D1 runtime uses two bindings:

- `MOJIDATA_DB`
- `IDSFIND_DB`

That fits comfortably inside the Free-plan database-count limits. The main risks
are not storage but:

- whether `idsfind` stays under the D1 per-invocation query limit
- whether representative requests stay under the daily rows-read budget
- whether repeated imports become too expensive for routine CI usage

The `mojidata` database includes a materialized `unihan_value_ref` reverse
lookup table so `/api/v1/mojidata` can answer `unihan_fts` lookups by indexed
character reference instead of scanning every Unihan value row on D1.

The working assumption is that Free is enough for:

- one-off imports
- smoke tests
- a small remote benchmark

It is not the right target for:

- sustained public traffic validation
- repeated full imports in CI
- larger load tests

## Minimal Worker target

The repository includes a private deployment workspace for this purpose:

- [packages/mojidata-api-d1-worker](../packages/mojidata-api-d1-worker)

It wraps `createD1FetchHandler()` from `@mandel59/mojidata-api-d1` and exposes a
minimal Worker entrypoint plus a `wrangler.jsonc` template. The same helper is
intended for a future `mojidata-web-app` Worker embedding, where the app receives
the same `MOJIDATA_DB` and `IDSFIND_DB` D1 bindings directly.

Useful root commands:

- `yarn mojidata-api:d1:provision`
- `yarn mojidata-api:d1:import`
- `yarn mojidata-api:d1:check`
- `yarn mojidata-api:d1:typegen`
- `yarn mojidata-api:d1:dev`
- `yarn mojidata-api:d1:deploy`
- `yarn mojidata-api:d1:smoke -- --base-url https://<worker>.workers.dev`
- `yarn mojidata-api:d1:prepare-import`

The `dev`, `deploy`, and `typegen` commands intentionally shell out to
`npx wrangler` instead of vendoring Wrangler into this repository. The first run
may therefore download the CLI.

The `provision` helper reuses an existing database if `wrangler d1 info` can
find it; otherwise it creates the database and rewrites
[packages/mojidata-api-d1-worker/wrangler.jsonc](../packages/mojidata-api-d1-worker/wrangler.jsonc)
with the resolved IDs.

## Standalone Worker setup

1. Prepare SQL dumps:

   ```sh
   corepack yarn mojidata-api:d1:prepare-import --output-dir /tmp/mojidata-d1-import
   ```

2. Provision the D1 databases and write their IDs into the Worker config:

   ```sh
   corepack yarn mojidata-api:d1:provision
   ```

3. Import the generated SQL:

   ```sh
   corepack yarn mojidata-api:d1:import -- --output-dir /tmp/mojidata-d1-import
   ```

4. Check the Worker package:

   ```sh
   corepack yarn mojidata-api:d1:check
   ```

5. Preview or deploy:

   ```sh
   corepack yarn mojidata-api:d1:dev
   corepack yarn mojidata-api:d1:deploy
   ```

6. Run the remote smoke test:

   ```sh
   corepack yarn mojidata-api:d1:smoke -- --base-url https://<worker>.workers.dev
   ```

7. Benchmark the deployed target:

   ```sh
   corepack yarn mojidata-api:bench:remote \
     --base-url https://<worker>.workers.dev \
     --label worker-d1 \
     --output-dir artifacts/bench/worker-d1
   ```

## mojidata-web-app integration

The initial Cloudflare migration for `mojidata-web-app` should use the
standalone API Worker over HTTP:

```sh
MOJIDATA_API_BASE_URL=https://mojidata-api-d1-production.<account>.workers.dev/
```

The app should keep the browser SPA database assets in R2 and use D1 only for
server-side API responses. This keeps the heavy sql.js DB downloads out of the
Worker bundle while giving server-rendered pages a Cloudflare-native data path.

The API contract is the existing `mojidata-api-hono` HTTP surface:

- `/api/v1/mojidata`
- `/api/v1/ivs-list`
- `/api/v1/idsfind`

The remote smoke script checks those routes and should be run before wiring a
new Worker URL into `mojidata-web-app`:

```sh
corepack yarn mojidata-api:d1:smoke \
  --base-url https://mojidata-api-d1-production.<account>.workers.dev/
```

There are still two possible later integration shapes:

1. Keep a separate D1-backed API Worker and point the app at it over HTTP
2. Embed the D1 backend package into the app's own Worker runtime and bind the
   same D1 databases directly

The second path may better match the current architecture because the app
already mixes server-side in-process API execution with desktop browser-worker
execution. The first path remains useful as the smallest independently testable
target and as a fallback deployment topology.

`#19` should end with a recommendation about which of those two shapes is the
default path forward.

## Environment-specific D1 targets

`packages/mojidata-api-d1-worker/wrangler.jsonc` defines top-level, `staging`,
and `production` D1 bindings. The root helpers can provision and import a
specific environment:

```sh
corepack yarn mojidata-api:d1:provision -- --env staging
corepack yarn mojidata-api:d1:import -- --env staging --output-dir /tmp/mojidata-d1-import
corepack yarn mojidata-api:d1:deploy --env staging
```

Use `--env production` for the production Worker. Keep staging and production
D1 database names separate; do not reuse the same D1 databases for import tests
and public traffic.
