# Japanese Unihan variant deployment — 2026-09-22

The existing public URL, <https://mojidata-api-d1.mandel59.workers.dev>, now
exposes `kJapaneseNewVariant` and `kJapaneseOldVariant` in character details,
variant traversal, and property searches.

## Release verification

- PRs [#69](https://github.com/mandel59/mojidata/pull/69) and
  [#67](https://github.com/mandel59/mojidata/pull/67) were merged.
- [Release run 35672996272](https://github.com/mandel59/mojidata/actions/runs/35672996272)
  succeeded and explicitly reported publishing `@mandel59/mojidata@1.9.1` and
  `@mandel59/mojidata-api-core@1.10.2`. Both versions were verified in npm.
- Worker runtime source: release commit `9f3a6c2e95a703d0d45fa9b6ed19e7f1b6442be7`.
  API packages were rebuilt after an immutable dependency install.
- Deployment tooling correction: `91b03714` (D1 Japanese variant materialization).
- Wrangler: 4.136.1.

## Versions and bindings

| Target | Worker version | Traffic |
| --- | --- | --- |
| Public/default | `518b1f73-35ca-4dbf-8f9b-cf6b4e7be9ea` | 100% |
| Staging | `61fc7dbe-d001-4292-8a52-d2ad557a62a9` | 100% |

Cloudflare deployment metadata is saved in [default-deployment.json](default-deployment.json)
and [staging-deployment.json](staging-deployment.json). Public promotion occurred
at 2026-09-22 01:23:36 UTC (10:23:36 JST).

| Binding | Database ID | Action |
| --- | --- | --- |
| `MOJIDATA_DB` | `eec0b92b-22f1-436a-8290-71c10dd68977` | New, imported from published mojidata 1.9.1 |
| `IDSFIND_DB` | `095c69ab-48be-4323-8fb1-a00af7ed931c` | Retained, idsdb-fts5 1.10.0 |

The former mojidata database, `6f957b62-6475-46fd-bfec-8f49238478d8`, was
retained for rollback. No databases were deleted. The named `production`
environment remains unused; public traffic uses the default target.

## D1 import correction

The published SQLite DB correctly contains 364 relations for each Japanese
property. During preparation, an additional fixed property list was found in
`scripts/prepare-mojidata-d1-import.mjs`: the D1 materializer omitted both
properties even though the published SQLite view included them.

The initial import had already started against the new, inactive DB. After it
completed, the corrected generator produced [japanese-variant-patch.sql](japanese-variant-patch.sql),
which inserted the missing 728 relations before any Worker was pointed at this
DB. The supplement was applied exactly once; it is not an idempotent migration.
Future full imports use the corrected generator and require no supplement.

[artifacts.json](artifacts.json) records the exact source DB, initial SQL dump,
and supplement hashes. The initial SQL dump deliberately records the artifact
actually imported, before the materializer correction. The IDS dump was prepared
from the published package for provenance but was not imported.

## Validation

- Worker/API build and Worker type checks passed.
- D1 import preparation tests: 10 passed, including single-valued new forms and
  multiple old forms backed by an aggregate view.
- All 728 Japanese D1 relations (including labels and additional data) matched
  the published SQLite view exactly in a direct remote SQL comparison.
- Standard API smoke tests: all four passed on [staging](staging-smoke.txt)
  and [public/default](default-smoke.txt).
- [Japanese checks](verify-japanese-variants.mjs) passed on
  [staging](staging-japanese.txt) and [public/default](default-japanese.txt):
  forward/reverse detail fields, both graph labels for 弁 ↔ 瓣・辨・辯, exact and
  code-point searches, old-form glob search, and both existence searches
  (364 new-form source characters and 362 old-form source characters).
- Japanese HTTP checks also asserted `Cache-Control: no-store`.

## Rollback

To restore the previous public mojidata binding, from the repository root:

```sh
node scripts/promote-mojidata-api-d1-release.mjs \
  --release-manifest docs/deployments/2026-09-22-japanese-variants/default-rollback.json
npx wrangler deploy --config packages/mojidata-api-d1-worker/wrangler.jsonc --env ''
node scripts/smoke-mojidata-api-remote.mjs \
  --base-url https://mojidata-api-d1.mandel59.workers.dev
```

The old DB lacks Japanese variant rows in its materialized detail/search table,
so those checks would no longer pass after a data rollback. Its raw source tables
remain compatible with the current Worker. To revert runtime code as well, the
previous public Worker version is `41f0caef-863f-449e-9a09-689d90b49e40`.
The staging rollback manifest is saved separately as [staging-rollback.json](staging-rollback.json).
