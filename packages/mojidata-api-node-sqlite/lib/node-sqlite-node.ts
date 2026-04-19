import type { DatabaseSync, SQLInputValue } from "node:sqlite"

import type { SqlExecutor } from "@mandel59/mojidata-api-core"
import { installMojidataSqlFunctions } from "@mandel59/mojidata-api-sqljs"

import { createNodeSqliteExecutor } from "./node-sqlite-executor"

type NodeSqliteModule = typeof import("node:sqlite")

function getNodeSqliteModule(): NodeSqliteModule {
  try {
    return require("node:sqlite") as NodeSqliteModule
  } catch (error) {
    const message =
      'The "node:sqlite" backend requires a Node.js release with built-in node:sqlite support (for example Node.js 22.13+, 23.4+, or newer).'
    const details = error instanceof Error && error.message ? ` Original error: ${error.message}` : ""
    throw new Error(`${message}${details}`)
  }
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
  let executorPromise: Promise<SqlExecutor> | undefined
  return function getExecutor(): Promise<SqlExecutor> {
    executorPromise ??= Promise.resolve(createNodeSqliteExecutor(openDatabaseFromFile(path)))
    return executorPromise
  }
}
