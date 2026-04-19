# mojidata-api D1 deployment

This document tracks the current deployment shape for the Cloudflare D1 backend
of `mojidata-api`.

## Scope

The current target is a bounded D1 proof of concept:

- stand up a minimal Cloudflare Worker backed by two D1 databases
- import `mojidata` and `idsfind` data from generated SQL dumps
- verify the core API routes remotely
- run a small remote benchmark against the deployed target

This is intentionally narrower than a full production rollout.

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

- [packages/mojidata-api-d1-worker](/Users/mandel59/ws/mojidata/packages/mojidata-api-d1-worker)

It wraps `createD1App()` from `@mandel59/mojidata-api-d1` and exposes a minimal
Worker entrypoint plus a `wrangler.jsonc` template.

Useful root commands:

- `yarn mojidata-api:d1:check`
- `yarn mojidata-api:d1:typegen`
- `yarn mojidata-api:d1:dev`
- `yarn mojidata-api:d1:deploy`
- `yarn mojidata-api:d1:prepare-import`

The `dev`, `deploy`, and `typegen` commands intentionally shell out to
`npx wrangler` instead of vendoring Wrangler into this repository. The first run
may therefore download the CLI.

## Standalone Worker setup

1. Prepare SQL dumps:

   ```sh
   corepack yarn mojidata-api:d1:prepare-import --output-dir /tmp/mojidata-d1-import
   ```

2. Create the D1 databases:

   ```sh
   npx wrangler d1 create mojidata-api-d1-mojidata
   npx wrangler d1 create mojidata-api-d1-idsfind
   ```

3. Copy the resulting database IDs into
   [packages/mojidata-api-d1-worker/wrangler.jsonc](/Users/mandel59/ws/mojidata/packages/mojidata-api-d1-worker/wrangler.jsonc).

4. Import the generated SQL:

   ```sh
   npx wrangler d1 execute mojidata-api-d1-mojidata --remote --file /tmp/mojidata-d1-import/mojidata.sql
   npx wrangler d1 execute mojidata-api-d1-idsfind --remote --file /tmp/mojidata-d1-import/idsdb-fts5.sql
   ```

5. Check the Worker package:

   ```sh
   corepack yarn mojidata-api:d1:check
   ```

6. Preview or deploy:

   ```sh
   corepack yarn mojidata-api:d1:dev
   corepack yarn mojidata-api:d1:deploy
   ```

7. Benchmark the deployed target:

   ```sh
   corepack yarn mojidata-api:bench:remote \
     --base-url https://<worker>.workers.dev \
     --label worker-d1 \
     --output-dir artifacts/bench/worker-d1
   ```

## Future mojidata-web-app integration

If `mojidata-web-app` moves to Cloudflare Workers later, there are two likely
integration shapes:

1. Keep a separate D1-backed API Worker and point the app at it over HTTP
2. Embed the D1 backend package into the app's own Worker runtime and bind the
   same D1 databases directly

The second path may better match the current architecture because the app
already mixes server-side in-process API execution with desktop browser-worker
execution. The first path remains useful as the smallest independently testable
target and as a fallback deployment topology.

`#19` should end with a recommendation about which of those two shapes is the
default path forward.
