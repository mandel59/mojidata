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
  const db = new poolUtil.OpfsSAHPoolDb(name, flags)
  db.exec("PRAGMA temp_store=memory")
  return db
}

export type CreateSqliteWasmDbFromOpfsSAHPoolOptions = {
  poolUtil: SqliteWasmSAHPoolUtil
  mojidata: OpfsSAHPoolMaterializeOptions
  idsfind: OpfsSAHPoolMaterializeOptions
}

export class SqliteWasmIdsfindSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SqliteWasmIdsfindSchemaError"
  }
}

export type SqliteWasmIdsfindSchemaDatabase = Pick<Database, "selectObject">

export function assertSqliteWasmIdsfindFts5Schema(
  db: SqliteWasmIdsfindSchemaDatabase,
) {
  const row = db.selectObject(
    "SELECT sql FROM sqlite_master WHERE name = 'idsfind_fts'",
  ) as { sql?: string } | undefined
  const sql = row?.sql ?? ""
  if (/\bUSING\s+fts5\b/iu.test(sql)) return

  const detected = /\bUSING\s+fts4\b/iu.test(sql) ? "FTS4" : "a non-FTS5"
  throw new SqliteWasmIdsfindSchemaError(
    `sqlite-wasm idsfind requires an FTS5 idsfind.db from @mandel59/idsdb-fts5; supplied database appears to use ${detected} schema.`,
  )
}

export function createSqliteWasmIdsfindDbProvider(openDatabase: DatabaseOpener) {
  let dbPromise: Promise<SqlExecutor> | undefined
  return function getDb(): Promise<SqlExecutor> {
    dbPromise ??= Promise.resolve(openDatabase()).then((db) => {
      assertSqliteWasmIdsfindFts5Schema(db)
      return createSqliteWasmExecutor(db)
    })
    return dbPromise
  }
}

export async function createSqliteWasmDbFromOpfsSAHPool({
  poolUtil,
  mojidata,
  idsfind,
}: CreateSqliteWasmDbFromOpfsSAHPoolOptions): Promise<MojidataApiDb> {
  return createSqliteWasmDb({
    getMojidataDb: createSqliteWasmMojidataDbProvider(async () => {
      await ensureOpfsSAHPoolDatabase(poolUtil, mojidata)
      return openOpfsSAHPoolDatabase(poolUtil, mojidata.name)
    }),
    getIdsfindDb: createSqliteWasmIdsfindDbProvider(async () => {
      await ensureOpfsSAHPoolDatabase(poolUtil, idsfind)
      return openOpfsSAHPoolDatabase(poolUtil, idsfind.name)
    }),
  })
}
