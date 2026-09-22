# mojidata-api D1 deployment

This document tracks the current deployment shape for the Cloudflare D1 backend
of `mojidata-api` and the contract used by `mojidata-web-app`.

## Latest deployment (2026-09-22)

The public/default and staging Workers now serve Japanese new/old variant
relations from published `mojidata@1.9.1` and API core `1.10.2`. A new mojidata
D1 database was imported and verified on staging before public promotion; the
existing `idsdb-fts5@1.10.0` database was retained. Both targets passed the four
standard smoke cases and Japanese variant detail, graph, and search checks.
See the [deployment record](deployments/2026-09-22-japanese-variants/README.md)
for Worker versions, artifact hashes, the D1 materialization correction, and
rollback manifests. The previous mojidata database remains available for rollback.

The public Worker uses the top-level/default config. The named `production`
environment still contains placeholder IDs. Future imports must use inactive
databases; public/default and staging currently share the new release data.

## Previous Unicode 18 deployment (2026-09-17)

The public/default Worker now serves the final Unicode 18 release. A fresh D1
pair was imported from published `mojidata@1.9.0` and `idsdb-fts5@1.10.0`,
validated through staging, and promoted to the existing public URL. The four
superseded public/staging databases were subsequently deleted at the owner's
request after verification; only the live pair remains. See the [deployment record](deployments/2026-09-17-unicode18/README.md)
for Worker versions, database IDs, verification results, and cleanup details.
Direct rollback to the deleted DBs or old Worker versions is no longer available.

At that deployment, staging and public/default read the same release pair.

## HTTP observation before this deployment (2026-09-17)

A [small deployed-D1 benchmark](benchmarks/2026-09-17/README.md#deployed-d1-observation) succeeded for three scenarios at the existing default Worker URL. It records client-observed latency only, not the current Worker version, database bindings, SQL rows-read budget, or a Unicode 18 deployment. Keep this evidence separate from local release-candidate results and historical Free-plan validation.

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

That fits comfortably inside the Free-plan database-count limits for one active
target. A blue/green D1 rollout temporarily keeps at least four databases for an
environment: the active pair and the release pair. Keep old rollback pairs only
as long as they are useful so the account stays under the database-count limit.

The main risks are not storage but:

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

## Local toolchain notes

D1 release/import work should currently be run with Node.js 22 on Windows. Node
24 has been observed to fail in the `ts-node`-based prepare path with
`EBADF: bad file descriptor, fstat`, while Node 22.21.1 completed the same
workflow.

The repository keeps package shell scripts and download manifests on LF line
endings via `.gitattributes`. This matters on Windows checkouts because the
prepare scripts are executed by bash and the download manifests are read by
curl-based scripts.

`packages/idsdb-fts5/scripts/prepare` normalizes its output directory with
`cygpath -w` when running under Git Bash. Without this, Windows Node receives a
POSIX-style `/c/...` output path and can miss `packages/idsdb-fts5/idsfind.db`.

## Minimal Worker target

The repository includes a private deployment workspace for this purpose:

- [packages/mojidata-api-d1-worker](../packages/mojidata-api-d1-worker)

It wraps `createD1FetchHandler()` from `@mandel59/mojidata-api-d1` and exposes a
minimal Worker entrypoint plus a `wrangler.jsonc` template. The same helper is
intended for a future `mojidata-web-app` Worker embedding, where the app receives
the same `MOJIDATA_DB` and `IDSFIND_DB` D1 bindings directly.

Useful root commands:

- `yarn mojidata-api:d1:provision`
- `yarn mojidata-api:d1:create-release`
- `yarn mojidata-api:d1:import`
- `yarn mojidata-api:d1:promote-release`
- `yarn mojidata-api:d1:check`
- `yarn mojidata-api:d1:typegen`
- `yarn mojidata-api:d1:dev`
- `yarn mojidata-api:d1:deploy`
- `yarn mojidata-api:d1:smoke -- --base-url https://<worker>.workers.dev`
- `yarn mojidata-api:d1:prepare-import`

The `dev`, `deploy`, and `typegen` commands intentionally shell out to
`npx wrangler` instead of vendoring Wrangler into this repository. The first run
may therefore download the CLI.

The `provision` helper exists for initial bootstrap only. It reuses an existing
database if `wrangler d1 info` can find it; otherwise it creates the database
and rewrites
[packages/mojidata-api-d1-worker/wrangler.jsonc](../packages/mojidata-api-d1-worker/wrangler.jsonc)
with the resolved IDs.

Routine data refreshes should use the blue/green release helpers instead of
importing into the active bindings.

## Import work and account quotas

Blue/green isolates data changes, but both databases share the account's D1
read/write allowance. Creating an inactive database does not isolate quota use.
The September 22 import read 5,494,879 rows and wrote 13,437,184 rows, enough to
exceed the Free allowances even before ordinary API traffic.

Import preparation now evaluates materialized views and IDS token grouping on
the local source SQLite database. It emits literal `INSERT ... VALUES` statements
and creates indexes while tables are empty, eliminating remote full-table
materialization and index backfills. Generated columns are omitted from insert
values, and IDS rowids are preserved. The source artifacts remain read-only.

The import manifest records the recipe, source/output hashes, data row counts,
and a lower bound on row writes including non-partial indexes. Import validates
all selected artifacts and their combined write budget before invoking Wrangler.
Old manifests, missing plans, and modified SQL dumps are rejected even with
`--skip-prepare`; regenerate them using the current preparation script.

`--max-rows-written` defaults to 100,000, the entire Free daily write allowance.
This is a ceiling, **not a measurement of remaining account quota**. Subtract
the day's existing usage and reserve capacity for live traffic before choosing
a budget. FTS segment maintenance and other engine work can add writes beyond
the manifest's lower bound; a passing preflight does not guarantee that a nearly
exhausted account can accept an import. The manifest does not claim an exact
Cloudflare `rows_read` count or zero total billed reads.

Full mojidata imports still require millions of writes and are rejected by the
default budget. Do not simply increase the flag on a Free account to force a
release through. Use a reviewed, bounded data/schema delta for small changes, or
provision sufficient account quota before planning a full import. The helper
does not automatically generate or apply deltas. Code-only releases should reuse
the existing DB bindings. Promote the same validated release database from
staging to public without re-importing it.

Plan without any remote DB write:

```sh
node scripts/import-mojidata-api-d1.mjs \
  --release-manifest /tmp/mojidata-api-d1-release.json \
  --output-dir /tmp/mojidata-d1-import --skip-prepare --dry-run
```

An over-budget plan exits nonzero and reports its minimum row writes. On an
account with sufficient confirmed quota, pass `--max-rows-written N` to both
the dry-run and actual import, where `N` is the allocated import write budget.
Do not use repeated full remote imports as tests: round-trip artifacts locally
and use bounded remote checks after deployment. Current checks cover literal
data, generated columns, FTS matching/rowids, and preflight rejection in CI.

## Blue/green standalone Worker setup

1. Prepare SQL dumps:

   ```sh
   corepack yarn mojidata-api:d1:prepare-import --output-dir /tmp/mojidata-d1-import
   ```

   To prepare a release from database artifacts that were built and verified in
   an isolated release environment, pass both source databases explicitly. This
   skips workspace package rebuilding and records the source and dump byte
   lengths and SHA-256 digests in `manifest.json`:

   ```sh
   corepack yarn mojidata-api:d1:prepare-import -- \
     --output-dir /tmp/mojidata-d1-import \
     --mojidata-db /release/moji.db \
     --idsfind-db /release/idsfind-fts5.db
   ```

2. Create a release D1 pair without changing the active Worker config:

   ```sh
   corepack yarn mojidata-api:d1:create-release \
     -- --env production \
     --release 20260503-unihan-ref \
     --manifest /tmp/mojidata-api-d1-release.json
   ```

   Omit `--env production` only when intentionally targeting the top-level
   default Worker config.

   To release only one DB binding, pass `--binding` one or more times. The
   release manifest keeps unselected bindings unchanged:

   ```sh
   corepack yarn mojidata-api:d1:create-release \
     -- --env production \
     --release 20260503-unihan-ref \
     --binding MOJIDATA_DB \
     --manifest /tmp/mojidata-api-d1-release.json
   ```

   Release database names are generated from fixed binding bases, not from the
   currently active database names. This prevents names from growing after
   repeated blue/green releases:

   - `MOJIDATA_DB`: `mojidata-api-d1-mojidata-<release>`
   - `IDSFIND_DB`: `mojidata-api-d1-idsfind-<release>`

   Keep release labels short and descriptive. The helper refuses generated names
   longer than 96 characters.

3. Import the generated SQL into the release pair:

   First run the dry-run above and confirm account capacity. The example below
   uses the default write budget; full production dumps will be rejected unless
   a sufficient, verified `--max-rows-written N` budget is supplied.

   ```sh
   corepack yarn mojidata-api:d1:import \
     -- --release-manifest /tmp/mojidata-api-d1-release.json \
     --output-dir /tmp/mojidata-d1-import \
     --skip-prepare
   ```

   The import helper refuses to import into active bindings unless
   `--unsafe-active` is passed. That flag is only for one-off destructive
   testing, not for public traffic.

   When the release manifest was created with `--binding`, import defaults to
   those selected bindings. You can also pass `--binding` explicitly to import a
   subset:

   ```sh
   corepack yarn mojidata-api:d1:import \
     -- --release-manifest /tmp/mojidata-api-d1-release.json \
     --binding MOJIDATA_DB \
     --output-dir /tmp/mojidata-d1-import \
     --skip-prepare
   ```

4. Promote the release pair in `wrangler.jsonc` and write a rollback manifest:

   ```sh
   corepack yarn mojidata-api:d1:promote-release \
     -- --release-manifest /tmp/mojidata-api-d1-release.json \
     --rollback-manifest /tmp/mojidata-api-d1-rollback.json
   ```

   For a per-DB release, promote only the selected binding. The stale manifest
   check is applied to that binding, and unselected bindings remain as-is:

   ```sh
   corepack yarn mojidata-api:d1:promote-release \
     -- --release-manifest /tmp/mojidata-api-d1-release.json \
     --binding MOJIDATA_DB \
     --rollback-manifest /tmp/mojidata-api-d1-rollback.json
   ```

5. Review the config diff and check the Worker package:

   ```sh
   jj diff --git packages/mojidata-api-d1-worker/wrangler.jsonc
   corepack yarn mojidata-api:d1:check
   ```

6. Deploy the Worker, then smoke-test the promoted target:

   ```sh
   corepack yarn mojidata-api:d1:deploy --env production
   corepack yarn mojidata-api:d1:smoke -- --base-url https://<worker>.workers.dev
   ```

7. Roll back by promoting the rollback manifest and deploying again:

   ```sh
   corepack yarn mojidata-api:d1:promote-release \
     -- --release-manifest /tmp/mojidata-api-d1-rollback.json
   corepack yarn mojidata-api:d1:deploy --env production
   corepack yarn mojidata-api:d1:smoke -- --base-url https://<worker>.workers.dev
   ```

8. Benchmark the deployed target:

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

Keep this URL stable across D1 blue/green releases. `mojidata-web-app` should
not receive release database names, release manifest paths, or temporary Worker
URLs. The release flow switches the D1 bindings behind the same Worker name, so
the app does not need a release-time redeploy when only the D1 data changes.

The API returns `Cache-Control: no-store` for JSON responses so a promoted D1
release is not hidden behind stale application, browser, or CDN caches. If a
future cache policy is added, it must include an explicit invalidation strategy
in the API Worker release flow instead of requiring `mojidata-web-app` to know
about D1 release IDs.

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
and `production` D1 bindings. The root helpers can create, import, and promote a
release for a specific environment:

```sh
corepack yarn mojidata-api:d1:create-release \
  -- --env staging \
  --release 20260503-unihan-ref \
  --manifest /tmp/mojidata-api-d1-staging-release.json
corepack yarn mojidata-api:d1:import \
  -- --release-manifest /tmp/mojidata-api-d1-staging-release.json \
  --output-dir /tmp/mojidata-d1-import
corepack yarn mojidata-api:d1:promote-release \
  -- --release-manifest /tmp/mojidata-api-d1-staging-release.json
corepack yarn mojidata-api:d1:deploy --env staging
```

Use `--env production` for the production Worker. Keep staging and production
D1 database names separate; do not reuse the same D1 databases for import tests
and public traffic.

Run the import once into inactive release databases, validate them through
staging, then promote those same databases to the public target. Do not repeat
the import for public promotion: it consumes the same account-wide quota again.
Only the final Worker deployment changes public traffic.
