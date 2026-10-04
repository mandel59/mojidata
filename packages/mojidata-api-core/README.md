# mojidata-api-core

Backend-neutral SQL composition utilities for `mojidata-api`.

The `mji` field includes `mjsm_note`, the MJ shrink-map reference note for each
MJ glyph. For example, `/api/v1/mojidata?char=鐥&select=mji` returns
`"mjsm_note": "国字:みずかね"` for `MJ068046`. The value is `null` when no
reference note exists. It is also included when `select` is omitted.

Select `kdpv_comment` to retrieve KDPV relations with nonempty comments:
`/api/v1/mojidata?char=充&select=kdpv_comment` returns
`[{"subject":"充","rel":"hydzd/variant","object":"𠑽","comment":"[充=⿱亠厶]"}]`
in that field. Both endpoints are matched by their first character, including
IVS, while the original relation direction and full endpoint strings are kept.
Identical records are deduplicated; different comments on the same relation
are retained. Missing/empty comments are omitted, so no matches returns `[]`.
The field is also included when `select` is omitted.

`createIdsfind` and `createSqlApiDb` use the existing FTS candidate query by
default. A backend that opens `@mandel59/idsdb-bvec/idsfind.db` can opt in to
the packed Bloom-vector scanner:

```ts
import {
  createBvecIdsfindCandidateProvider,
  createSqlApiDb,
} from "@mandel59/mojidata-api-core"

const api = createSqlApiDb({
  getMojidataDb,
  getIdsfindDb,
  idsfindCandidateProvider: createBvecIdsfindCandidateProvider(),
})
```

The provider only generates candidates. The existing exact IDS matcher remains
the authority for returned results.

New deployments can reject compatibility manifests and require a schema 3
registered semantics profile:

```ts
const api = createSqlApiDb({
  getMojidataDb,
  getIdsfindDb,
  idsfindOptions: { requireRegisteredQuerySemantics: true },
})
```

Compatibility remains the default for existing schema 1, schema 2, and
manifest-less databases. Experimental schema 3 plans instead require the
separate `allowExperimentalQueryPlan` opt-in and are always rejected by the
strict policy.
