import { installMojidataSqlFunctions, type SqlExecutor } from "@mandel59/mojidata-api-core"
import type { Database } from "sql.js"

import { createSqlJsExecutor } from "./sqljs-executor"

export type DatabaseOpener = () => Promise<Database>

async function initDb(db: Database) {
  installMojidataSqlFunctions((name, fn) => {
    db.create_function(name, fn)
  })
}

export function createMojidataDbProvider(openDatabase: DatabaseOpener) {
  let dbPromise: Promise<SqlExecutor> | undefined
  return function getMojidataDb(): Promise<SqlExecutor> {
    dbPromise ??= openDatabase().then(async (db) => {
      await initDb(db)
      return createSqlJsExecutor(db)
    })
    return dbPromise
  }
}
