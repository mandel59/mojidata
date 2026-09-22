# D1 quota review policy

D1 quota is a correctness and availability constraint, not a performance
optimization to check after deployment. A functionally correct change is not
ready if its operational cost is unknown or cannot fit the account budget.

## Baseline and cause

The September 22 release checked data correctness, storage and blue/green
isolation without budgeting account-wide reads/writes. Staging and inactive
release databases share the public service's allowance. Moving work to a new
DB does not protect the live API from quota exhaustion.

As verified on 2026-09-22, the [Cloudflare pricing documentation](https://developers.cloudflare.com/d1/platform/pricing/)
lists Free limits of 5,000,000 rows read/day and 100,000 rows written/day,
resetting at 00:00 UTC (09:00 JST). Quota exhaustion causes query errors. Index
maintenance adds writes; DDL, imports and Wrangler queries also consume quota.
Check the actual account plan and current documentation before operational work.
Changing a CLI budget does not change the service plan or authorize an upgrade.

## Required before implementation and review

1. Trace D1 impact through shared SQL, Unicode/data generation, views, indexes,
   recursive traversal, request fan-out, cache misses, import, smoke checks and
   benchmarks. Unchanged SQL can cost more after a data update.
2. Record before/after costs and the workload: full request rather than one
   query, frontier width/depth, reverse edges, IVS, Latin-1 fallback, empty/no-hit
   searches, broad search, and data size. Identify bounds and regression tests.
   Returned row counts, latency, `LIMIT`, and passing correctness tests do not
   prove a bounded number of scanned rows.
3. Use published/local DB artifacts first: compare results, inspect query plans
   and full-scan statistics, and check import plans. Local VM/full-scan steps
   are evidence about scaling, not Cloudflare billing. A minimum write estimate
   is not a safe upper bound. Unknown costs block execution, not permission to
   spend the whole allowance finding out.
4. Budget reads AND writes across every database in the account. Include current
   daily usage, remaining normal traffic, staging, validation, rollout, retries
   and rollback. For each metric require:
   `existing usage + traffic reserve + operation upper bound <= daily limit`.
   Count every invocation; do not budget independently per database or per query.
5. Specify rollout, stop conditions and rollback. Reuse DBs for code-only
   releases, import once then promote, and use reviewed bounded deltas for small
   data changes. Full Free imports are blocked. Do not run remote full scans,
   repeated benchmarks or imports to validate a cost fix. Any remote measurement
   must have a small preallocated upper bound and stop when it is exhausted.
   Recheck usage immediately before execution; a PR record is not a live permit.

## CI evidence gate

For changes to packages (including shared code and data), scripts, workflows,
root dependencies or these policies, add/update a JSON record in
`docs/d1-quota-reviews/`. Ordinary documentation is excluded. A change with no D1
impact still needs a concrete explanation of why the changed paths cannot alter
D1 work. This broad scope deliberately covers newly added tools/packages.

The record has `version: 1`, a `files` object mapping every affected changed
path to its SHA-256 (`deleted` for removals), repository-relative `evidence`
paths, and substantive descriptions in these fields:

- `scope`: affected request, data and operational paths; impact or no-impact reason.
- `beforeAfter`: measured/estimated costs, units, input sizes and uncertainty.
- `accountBudget`: aggregate workload, reserves, retries and account usage.
- `validation`: local tests/plans, representative and worst-case inputs, evidence.
- `rolloutAndStop`: safe deployment, abort and recovery conditions.

`decision` is one of:

- `unchanged`: explain why the change cannot increase D1 work; not a waiver for
  changes that merely appear fast or pass semantic tests.
- `bounded`: provide `budget.reads` and `budget.writes`, each with nonnegative
  integer `limit`, `existing`, `trafficReserve`, and `operationUpperBound`.
  CI checks the sums against the current Free policy. Include the derivation
  and freshness of these numbers in the evidence. A plan change requires a
  separate explicit policy review.
- `blocked`: merging a prevention/fix is safe, but the described D1 operation
  remains disabled. Explain how execution is blocked and what evidence is
  needed to unblock it. This must not be used to ship an unbounded active query.

Generate fingerprints with `sha256sum <path>` after final edits. See the
[initial review](d1-quota-reviews/2026-09-22-import-and-policy.json) for an example.
CI requires the record itself to be in the current diff and validates its
fingerprints; an older record does not cover later edits. Missing history,
malformed records, stale fingerprints and absent evidence fail closed.
PR validation and main release both run the gate before publishing.

CI enforces the presence, freshness and arithmetic of the review, not the truth
of its claims. Reviewers must verify evidence and no-impact/blocked decisions.
Protect `main` with the `validate` required status check to prevent merging a
failing PR; without repository branch protection a workflow alone cannot enforce
that. Changes to this gate/policy require the same quota review.
