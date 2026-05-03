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

Public subpaths:

- `@mandel59/mojidata-api-sqlite-wasm/browser-worker`
- `@mandel59/mojidata-api-sqlite-wasm/opfs-sahpool`
- `@mandel59/mojidata-api-sqlite-wasm/sqlite-wasm-executor`

Use these public subpaths instead of private `lib/*` paths.

Example worker client:

```ts
import { createMojidataApiWorkerClient } from "@mandel59/mojidata-api-runtime"

const worker = new Worker(
  new URL("@mandel59/mojidata-api-sqlite-wasm/browser-worker", import.meta.url),
  { type: "module" },
)

const db = createMojidataApiWorkerClient(worker, {
  sqlWasmUrl: "/assets/sqlite3.wasm",
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

`sqlWasmUrl` is passed to SQLite wasm as the `sqlite3.wasm` URL. Applications
can also pass `sqliteWasm.wasmUrl` to override it, or `sqliteWasm.wasmBinary`
when the app already fetched the wasm bytes through its own asset pipeline.
Custom workers can call `getSqliteWasm({ wasmUrl, wasmBinary, locateFile })`
directly when they need lower-level control.

The browser worker initializes SQLite and the OPFS pool during `ready`, but DB
assets are imported lazily. `moji.db` is downloaded/imported on the first
mojidata query, and `idsfind.db` is downloaded/imported on the first IDS query.

## idsfind DB requirement

SQLite wasm supports FTS5 but not the legacy FTS4 module used by
`@mandel59/idsdb`. For sqlite-wasm backends, `idsfindDbUrl` must point at the
FTS5 database from `@mandel59/idsdb-fts5`.

The OPFS runtime validates the `idsfind_fts` virtual table before creating the
idsfind executor. If an FTS4 database is supplied, initialization fails with
`SqliteWasmIdsfindSchemaError` and a message that points to
`@mandel59/idsdb-fts5`.

Typical browser asset wiring:

```ts
const db = createMojidataApiWorkerClient(worker, {
  sqlWasmUrl: "/assets/sqlite3.wasm",
  mojidataDbUrl: "/assets/moji.db",
  idsfindDbUrl: "/assets/idsfind-fts5.db",
})
```

`opfs-sahpool` is only available from Worker contexts with OPFS APIs. In
unsupported contexts, use `tryEnsureOpfsSAHPoolDatabase()` or catch
`SqliteWasmOpfsError` and fall back to the existing SQL.js backend.

The package does not copy or serve `moji.db`, `idsfind.db`, or `sqlite3.wasm`
assets. Applications should keep asset URL/versioning, Cache Storage prefetch,
and framework middleware in the application layer.
