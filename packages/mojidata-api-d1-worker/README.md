# mojidata-api-d1-worker

`@mandel59/mojidata-api-d1-worker` is a private deployment workspace for
validating `@mandel59/mojidata-api-d1` on Cloudflare Workers.

It is not a published package. Its purpose is to provide:

- a minimal Worker entrypoint using `createD1App()`
- a `wrangler.jsonc` template with the required D1 bindings
- a reproducible local/remote deployment path for `#19`

## Files

- [src/index.ts](/Users/mandel59/ws/mojidata/packages/mojidata-api-d1-worker/src/index.ts)
- [wrangler.jsonc](/Users/mandel59/ws/mojidata/packages/mojidata-api-d1-worker/wrangler.jsonc)

## Usage

From the repository root:

```sh
corepack yarn mojidata-api:d1:prepare-import --output-dir /tmp/mojidata-d1-import
corepack yarn mojidata-api:d1:check
corepack yarn mojidata-api:d1:smoke -- --base-url https://<worker>.workers.dev
corepack yarn mojidata-api:d1:dev
```

`dev`, `deploy`, and `cf-typegen` use `npx wrangler`, so the first invocation
may download Wrangler if it is not already available locally.

For the full setup flow and the Cloudflare integration notes for
`mojidata-web-app`, see
[docs/mojidata-api-d1-deployment.md](/Users/mandel59/ws/mojidata/docs/mojidata-api-d1-deployment.md).
