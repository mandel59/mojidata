# Unicode 18 D1 deployment — 2026-09-17 JST

The existing public Worker was switched to the newly imported, validated D1 pair
using a blue/green deployment. The public URL is unchanged:
<https://mojidata-api-d1.mandel59.workers.dev>.

## Deployed versions

| Target | Worker version |
| --- | --- |
| Public/default | `f2c29338-e1b7-4608-b2aa-967150bdd81e` |
| Staging validation | `ca874934-b9ac-40b6-acbc-426406f5cc26` |
| Previous public version | `8790afd3-aab9-4f11-b8e8-143cfb142ffd` |

Worker code comes from release commit `4d33f37dfe6d64963b9621178178f9190208bbd2`.
The deployment helper compatibility fix is recorded separately in `7c4f44d2`.
Wrangler 4.132.0 was used.

## Data and promotion

The source databases were extracted from published npm packages
`@mandel59/mojidata@1.9.0` and `@mandel59/idsdb-fts5@1.10.0`.
[artifacts.json](artifacts.json) records the source DB and sanitized SQL hashes
and sizes; paths are relative to the temporary deployment artifact directory.

| Binding | New database ID |
| --- | --- |
| `MOJIDATA_DB` | `6f957b62-6475-46fd-bfec-8f49238478d8` |
| `IDSFIND_DB` | `095c69ab-48be-4323-8fb1-a00af7ed931c` |

These databases were created with `staging-u18-20260917` names, imported once,
checked through the staging Worker, and then promoted to the public Worker.
The names describe where validation began; the pair is now live. Both Workers
currently read the same immutable release data. For the next staging import,
create a fresh inactive pair; never import over this live pair.
The configured `production` environment still contains bootstrap placeholders;
the existing public deployment uses the top-level/default target.

The former public DB pair was deleted after release verification on 2026-09-17 JST:

- mojidata: `869556cd-9a42-4423-9b22-cff4c1eafca2`
- idsfind: `18e0c4f7-006c-474c-87e2-a00de91bec98`

## Verification

- D1 import preparation checks: 9 passed; Worker type checks and bundle dry-run passed.
- All four API smoke cases passed on [staging](staging-smoke.txt) and
  [public/default](default-smoke.txt).
- Remote D1 returned `UK-01469` → `U+300BB`, `⿰亻𬂉`.
- The public HTTP API returned `勒` → `unihan.kJinmeiyoKanji: "2026"`
  with `Cache-Control: no-store`.
- Cloudflare's Worker version metadata confirmed both new database bindings.

## Small post-deployment benchmark

[d1-benchmark.json](d1-benchmark.json) records 3 scenarios, each with 1 warmup
and 5 measured requests (18 requests total). Median client-observed times were
42.38 ms for mojidata-select, 40.71 ms for ivs-list, and 69.24 ms for idsfind-ids.
This is a small deployment observation, not a load test or a CPU-only comparison.
The JSON Git metadata identifies the local benchmark runner; the actual deployed
Worker version was verified separately above.

## Old database cleanup — 2026-09-17 JST

At the owner's request, all four superseded databases were deleted after
confirming that both public/default and staging served 100% from the new Worker
versions and referenced only the new release pair.

| Former use | Deleted database ID |
| --- | --- |
| Public mojidata | `869556cd-9a42-4423-9b22-cff4c1eafca2` |
| Public idsfind | `18e0c4f7-006c-474c-87e2-a00de91bec98` |
| Staging mojidata | `517ba6a8-42a1-4020-b8c3-2129bed129e2` |
| Staging idsfind | `0013717e-8868-4eff-b9d2-49f056f928b2` |

Only the two live Unicode 18 databases remain. The rollback manifests targeting
deleted databases were removed; release manifests retain previous IDs solely as
historical deployment records. Restoring an old Worker version would reference
deleted databases and is no longer a valid rollback procedure. Returning to
older data requires creating fresh databases and importing that release's data.

After deletion, all four smoke cases passed on both public/default and staging.
