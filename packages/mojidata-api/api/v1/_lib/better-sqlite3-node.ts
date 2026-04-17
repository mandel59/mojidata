import type BetterSqlite3Database from "better-sqlite3"

import { createCachedPromise } from "./promise-cache"
import { installMojidataSqlFunctions } from "./mojidata-db"
import { createBetterSqlite3Executor } from "./better-sqlite3-executor"
import type { SqlExecutor } from "./sql-executor"

function getBetterSqlite3Ctor(): typeof BetterSqlite3Database {
  return require("better-sqlite3") as typeof BetterSqlite3Database
}

function openDatabaseFromFile(path: string): BetterSqlite3Database.Database {
  const Database = getBetterSqlite3Ctor()
  return new Database(path, { readonly: true, fileMustExist: true })
}

export function createBetterSqlite3MojidataDbProvider(path: string) {
  let db: BetterSqlite3Database.Database | undefined
  let executorPromise: Promise<SqlExecutor> | undefined
  return function getMojidataDb(): Promise<SqlExecutor> {
    executorPromise ??= Promise.resolve().then(() => {
      db ??= openDatabaseFromFile(path)
      installMojidataSqlFunctions((name, fn) => {
        db!.function(name, fn)
      })
      return createBetterSqlite3Executor(db)
    })
    return executorPromise
  }
}

export function createBetterSqlite3ExecutorProvider(path: string) {
  const getDb = createCachedPromise(() =>
    Promise.resolve(createBetterSqlite3Executor(openDatabaseFromFile(path))),
  )
  return function getExecutor(): Promise<SqlExecutor> {
    return getDb()
  }
}
