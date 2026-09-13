# mojidata-api-core

Backend-neutral SQL composition utilities for `mojidata-api`.

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
