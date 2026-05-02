import type { Database, SqlValue } from "@sqlite.org/sqlite-wasm"

import { installMojidataSqlFunctions } from "@mandel59/mojidata-api-core"

type SqliteWasmFunctionDb = Pick<Database, "createFunction">

export function installMojidataSqliteWasmFunctions(db: SqliteWasmFunctionDb) {
  installMojidataSqlFunctions((name, fn) => {
    db.createFunction({
      name,
      arity: fn.length,
      deterministic: true,
      innocuous: true,
      xFunc: (_ctxPtr, ...args) => fn(...(args as never[])) as SqlValue,
    })
  })
}
