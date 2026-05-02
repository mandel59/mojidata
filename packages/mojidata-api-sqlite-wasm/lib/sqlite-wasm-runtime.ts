import { createSqlApiDb, type MojidataApiDb, type SqlExecutor } from "@mandel59/mojidata-api-core"
import type { Database } from "@sqlite.org/sqlite-wasm"

import {
  ensureOpfsSAHPoolDatabase,
  type OpfsSAHPoolMaterializeOptions,
  type SqliteWasmSAHPoolUtil,
} from "./opfs-sahpool.js"
import { createSqliteWasmExecutor } from "./sqlite-wasm-executor.js"
import { installMojidataSqliteWasmFunctions } from "./sqlite-wasm-functions.js"

export type DatabaseOpener = () => Promise<Database> | Database

export function createSqliteWasmMojidataDbProvider(openDatabase: DatabaseOpener) {
  let dbPromise: Promise<SqlExecutor> | undefined
  return function getMojidataDb(): Promise<SqlExecutor> {
    dbPromise ??= Promise.resolve(openDatabase()).then((db) => {
      installMojidataSqliteWasmFunctions(db)
      return createSqliteWasmExecutor(db)
    })
    return dbPromise
  }
}

export function createSqliteWasmExecutorProvider(openDatabase: DatabaseOpener) {
  let dbPromise: Promise<SqlExecutor> | undefined
  return function getDb(): Promise<SqlExecutor> {
    dbPromise ??= Promise.resolve(openDatabase()).then((db) => createSqliteWasmExecutor(db))
    return dbPromise
  }
}

export function createSqliteWasmDb({
  getMojidataDb,
  getIdsfindDb,
}: {
  getMojidataDb: () => Promise<SqlExecutor>
  getIdsfindDb: () => Promise<SqlExecutor>
}): MojidataApiDb {
  return createSqlApiDb({ getMojidataDb, getIdsfindDb })
}

export function openOpfsSAHPoolDatabase(
  poolUtil: SqliteWasmSAHPoolUtil,
  name: string,
  flags = "r",
): Database {
  return new poolUtil.OpfsSAHPoolDb(name, flags)
}

export type CreateSqliteWasmDbFromOpfsSAHPoolOptions = {
  poolUtil: SqliteWasmSAHPoolUtil
  mojidata: OpfsSAHPoolMaterializeOptions
  idsfind: OpfsSAHPoolMaterializeOptions
}

export async function createSqliteWasmDbFromOpfsSAHPool({
  poolUtil,
  mojidata,
  idsfind,
}: CreateSqliteWasmDbFromOpfsSAHPoolOptions): Promise<MojidataApiDb> {
  await ensureOpfsSAHPoolDatabase(poolUtil, mojidata)
  await ensureOpfsSAHPoolDatabase(poolUtil, idsfind)

  return createSqliteWasmDb({
    getMojidataDb: createSqliteWasmMojidataDbProvider(() =>
      openOpfsSAHPoolDatabase(poolUtil, mojidata.name),
    ),
    getIdsfindDb: createSqliteWasmExecutorProvider(() =>
      openOpfsSAHPoolDatabase(poolUtil, idsfind.name),
    ),
  })
}
