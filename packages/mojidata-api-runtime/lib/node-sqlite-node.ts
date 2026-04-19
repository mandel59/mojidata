import type { DatabaseSync, SQLInputValue } from "node:sqlite"

import type { SqlExecutor } from "@mandel59/mojidata-api-core"
import { installMojidataSqlFunctions } from "@mandel59/mojidata-api-sqljs"

import { createNodeSqliteExecutor } from "./node-sqlite-executor"
import { createCachedPromise } from "./promise-cache"

type NodeSqliteModule = typeof import("node:sqlite")

function getNodeSqliteModule(): NodeSqliteModule {
  return require("node:sqlite") as NodeSqliteModule
}

function openDatabaseFromFile(path: string): DatabaseSync {
  const { DatabaseSync } = getNodeSqliteModule()
  return new DatabaseSync(path, { readOnly: true })
}

export function createNodeSqliteMojidataDbProvider(path: string) {
  let db: DatabaseSync | undefined
  let executorPromise: Promise<SqlExecutor> | undefined
  return function getMojidataDb(): Promise<SqlExecutor> {
    executorPromise ??= Promise.resolve().then(() => {
      db ??= openDatabaseFromFile(path)
      installMojidataSqlFunctions((name: string, fn: (...args: never[]) => unknown) => {
        db!.function(name, fn as (...args: unknown[]) => SQLInputValue)
      })
      return createNodeSqliteExecutor(db)
    })
    return executorPromise
  }
}

export function createNodeSqliteExecutorProvider(path: string) {
  const getDb = createCachedPromise(() =>
    Promise.resolve(createNodeSqliteExecutor(openDatabaseFromFile(path))),
  )
  return function getExecutor(): Promise<SqlExecutor> {
    return getDb()
  }
}
