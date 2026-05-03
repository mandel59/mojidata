# mojidata-api-d1-worker

`@mandel59/mojidata-api-d1-worker` is a private deployment workspace for
validating `@mandel59/mojidata-api-d1` on Cloudflare Workers.

It is not a published package. Its purpose is to provide:

- a minimal Worker entrypoint using `createD1FetchHandler()`
- a `wrangler.jsonc` template with the required D1 bindings
- a reproducible local/remote deployment path for `#19`

## Files

- [src/index.ts](src/index.ts)
- [wrangler.jsonc](wrangler.jsonc)

## Usage

From the repository root:

```sh
corepack yarn mojidata-api:d1:prepare-import --output-dir /tmp/mojidata-d1-import
corepack yarn mojidata-api:d1:create-release \
  -- --manifest /tmp/mojidata-api-d1-release.json
corepack yarn mojidata-api:d1:import \
  -- --release-manifest /tmp/mojidata-api-d1-release.json \
  --output-dir /tmp/mojidata-d1-import \
  --skip-prepare
corepack yarn mojidata-api:d1:promote-release \
  -- --release-manifest /tmp/mojidata-api-d1-release.json
corepack yarn mojidata-api:d1:check
corepack yarn mojidata-api:d1:smoke -- --base-url https://<worker>.workers.dev
corepack yarn mojidata-api:d1:dev
```

For staging or production bindings, pass the Wrangler environment through the
release helpers and the deploy command:

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

`mojidata-api:d1:provision` is for initial bootstrap. Routine data refreshes
should create and import into inactive release databases first. The import
helper refuses active binding imports unless `--unsafe-active` is provided for
one-off destructive testing.

`dev`, `deploy`, and `cf-typegen` use `npx wrangler`, so the first invocation
may download Wrangler if it is not already available locally.

`mojidata-web-app` should consume the deployed Worker over HTTP first by setting
`MOJIDATA_API_BASE_URL` to the Worker URL. Embedding the D1 runtime directly into
the Next.js Worker remains a later optimization after the standalone API Worker
has production-like smoke and benchmark results.

For the full setup flow and the Cloudflare integration notes for
`mojidata-web-app`, see
[docs/mojidata-api-d1-deployment.md](../../docs/mojidata-api-d1-deployment.md).
