# API reference notes deployment — 2026-10-04

Merged [PR #75](https://github.com/mandel59/mojidata/pull/75) at
`977b05bf32ffb0b73e7f3d5b08476df066620fb5`, then deployed staging and the
public/default Worker using Wrangler 4.136.1. The code adds `mji[].mjsm_note`
and selectable `kdpv_comment`; database bindings and artifacts remain unchanged.
No migrations, imports or D1 writes were performed.

| Target | Version at 100% | Rollback version |
| --- | --- | --- |
| staging | `2da1cf6a-2177-4366-b3ee-3f16f56661bd` | `61fc7dbe-d001-4292-8a52-d2ad557a62a9` |
| public/default | `8d43a3a3-9074-4dfa-9ecd-0682dfa31643` | `518b1f73-35ca-4dbf-8f9b-cf6b4e7be9ea` |

The public endpoint is <https://mojidata-api-d1.mandel59.workers.dev>.
Management API deployment snapshots and `artifacts.json` identify the released
versions, source commit, input/bundle hashes and unchanged D1 bindings.

## Verification and budget

47 local API/runtime tests, SQL executor tests and affected TypeScript checks
passed before merge. The merged source also passed the Hono build, D1 Worker
check and Wrangler dry run. `local-cost.json` records the fingerprinted source
artifact, D1-style materializations and indexed query plans; every planned
selected/full-response case has zero local fullscan steps. Local VM steps are
scaling evidence, not Cloudflare billed row counts.

The bounded remote preflight checked the materialized KDPV comment column,
subject/object indexes and MJ note primary key. Three SQL queries read
548 + 1 + 10 = 559 rows and wrote zero; their complete metadata is saved in
`remote-*.json`. `verify-api-notes.mjs` then made exactly six fixed HTTP requests
per target, with no retries or graph/search calls. Both targets passed MJ notes
for 鐥, KDPV notes from both endpoints, an empty result for A and two full
responses, including CORS and no-store headers. Outputs are retained in
`staging-verification.json` and `public-verification.json`.

The [deployment quota review](../../d1-quota-reviews/2026-10-04-api-notes-deploy.json)
was written before remote preflight. Account-wide usage was refreshed before
schema verification, staging and public deployment. The snapshots record about
1.386 million daily reads and zero writes. The budget reserved 2.5 million reads
and 10,000 writes for remaining normal traffic plus 100,000 reads/zero writes
for all rollout work, including one rollback/retry cycle. Remaining baseline
traffic projected from today's rate was approximately 1.06 million reads;
the traffic reserve exceeds twice that baseline plus a lag/growth margin.

Existing Workers and account settings use the standard usage model. The OAuth
credential cannot read billing subscriptions, so this release relies on the
smaller [published Free caps](https://developers.cloudflare.com/d1/platform/pricing/)
(5 million reads/100,000 writes daily), with no paid-plan headroom.
GraphQL analytics can lag: `budget-after-public.json` is an observation, not an
exact attribution of HTTP query billing. HTTP responses do not expose D1 row
counts. The fixed case bounds, indexed local plans and direct SQL metadata
supply the preflight evidence; current usage must be refreshed for any rerun.

## Stop and rollback

Stop on budget/projection failure, unknown cost, mismatched bindings or indexes,
unexpected writes, per-case SQL cap breach or failed HTTP verification. The
planned metadata cap was 5,000 reads; each direct selected SQL cap was 1,000.
HTTP allocations were 1,000 per selected request and 10,000 per full response,
with 45,000 reserved for one rollback/retry cycle. No retry/rollback was needed.

Recheck the account budget before recovery. Roll back code using the versions
above and the current config; do not change bindings or import databases:

```sh
npx --offline wrangler rollback 61fc7dbe-d001-4292-8a52-d2ad557a62a9 --config packages/mojidata-api-d1-worker/wrangler.jsonc --env staging
npx --offline wrangler rollback 518b1f73-35ca-4dbf-8f9b-cf6b4e7be9ea --config packages/mojidata-api-d1-worker/wrangler.jsonc --env ''
```
