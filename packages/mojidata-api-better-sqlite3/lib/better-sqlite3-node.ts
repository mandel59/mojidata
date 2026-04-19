import type BetterSqlite3Database from "better-sqlite3"

import type { SqlExecutor } from "@mandel59/mojidata-api-core"
import { installMojidataSqlFunctions } from "@mandel59/mojidata-api-sqljs"

import { createBetterSqlite3Executor } from "./better-sqlite3-executor"

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
      installMojidataSqlFunctions((name: string, fn: (...args: never[]) => unknown) => {
        db!.function(name, fn)
      })
      return createBetterSqlite3Executor(db)
    })
    return executorPromise
  }
}

export function createBetterSqlite3ExecutorProvider(path: string) {
  let executorPromise: Promise<SqlExecutor> | undefined
  return function getExecutor(): Promise<SqlExecutor> {
    executorPromise ??= Promise.resolve(
      createBetterSqlite3Executor(openDatabaseFromFile(path)),
    )
    return executorPromise
  }
}
