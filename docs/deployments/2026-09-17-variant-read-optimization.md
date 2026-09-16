# D1 variant read optimization deployment

- Date: 2026-09-17 JST (public deployment: 2026-09-16 22:10:06 UTC).
- Source: `cad73a727d8919389d92f853e3bcaa448051f601`, PR #66, related issue #65.
- Staging version: `590f8ca8-d405-4659-abc6-e0c273b62e5b`.
- Public version: `41f0caef-863f-449e-9a09-689d90b49e40`, confirmed at 100% traffic.
- Public URL: https://mojidata-api-d1.mandel59.workers.dev

Built with `corepack yarn build:mojidata-api-split`; the D1 Worker type check
passed. Deployed staging first, then the default/public Worker using Wrangler.
The existing Unicode 18 D1 database bindings were retained without data changes.
The source is the tested PR head; this deployment did not merge PR #66.

Both staging and public smoke checks passed the basic character query, then
stopped at HTTP 500 for IVS lookup. One additional staging variant request also
returned 500. Staging Worker logs confirmed the existing account-wide D1 daily
row-read quota was exhausted. The optimized SQL had already executed successfully
through the D1 SQL API, as recorded in the optimization measurements.

Deployment succeeded, but full HTTP verification remains pending until the
daily quota resets (00:00 UTC / 09:00 JST). Do not treat this rollout as a passed
end-to-end smoke test. Run the following once after quota recovery:

```sh
node scripts/smoke-mojidata-api-remote.mjs --base-url https://mojidata-api-d1.mandel59.workers.dev
```
