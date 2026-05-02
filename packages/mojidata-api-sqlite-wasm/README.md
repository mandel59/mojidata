# mojidata-api-sqlite-wasm

`@mandel59/mojidata-api-sqlite-wasm` provides a browser-oriented SQLite wasm
backend for `mojidata-api`.

The package targets `@sqlite.org/sqlite-wasm` and its `opfs-sahpool` VFS. It
keeps the default `@mandel59/mojidata-api` and `@mandel59/mojidata-api-sqljs`
paths unchanged, so applications can opt in to the larger SQLite wasm backend
only when they need persistent OPFS storage.

It includes:

- `createSqliteWasmExecutor()`: an OO1 API adapter for `SqlExecutor`
- `installMojidataSqliteWasmFunctions()`: registers mojidata UDFs on SQLite wasm
- `installOpfsSAHPool()`: initializes `opfs-sahpool` in a Worker context
- `tryInstallOpfsSAHPool()`: reports pool initialization failures for fallback handling
- `ensureOpfsSAHPoolDatabase()`: imports an asset DB into OPFS with a manifest
- `createSqliteWasmDbFromOpfsSAHPool()`: wires OPFS DB handles to `createSqlApiDb()`
- `@mandel59/mojidata-api-sqlite-wasm/browser-worker`: worker entrypoint using the shared mojidata-api worker protocol

Example worker client:

```ts
import { createMojidataApiWorkerClient } from "@mandel59/mojidata-api-runtime"

const worker = new Worker(
  new URL("@mandel59/mojidata-api-sqlite-wasm/browser-worker", import.meta.url),
  { type: "module" },
)

const db = createMojidataApiWorkerClient(worker, {
  sqlWasmUrl: "",
  mojidataDbUrl: "/assets/moji.db",
  idsfindDbUrl: "/assets/idsfind.db",
  sqliteWasm: {
    mojidataDbVersion: "moji-db-v1",
    idsfindDbVersion: "idsfind-db-v1",
    mojidataDbByteLength: 123456,
    idsfindDbByteLength: 654321,
  },
})

await db.ready
```

`opfs-sahpool` is only available from Worker contexts with OPFS APIs. In
unsupported contexts, use `tryEnsureOpfsSAHPoolDatabase()` or catch
`SqliteWasmOpfsError` and fall back to the existing SQL.js backend.

The package does not copy or serve `moji.db`, `idsfind.db`, or `sqlite3.wasm`
assets. Applications should keep asset URL/versioning, Cache Storage prefetch,
and framework middleware in the application layer.
