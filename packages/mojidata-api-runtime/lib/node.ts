import { createSqlApiDb } from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"
import {
  createMojidataDbProvider,
  createSqlJsExecutor,
  openDatabaseFromFile,
} from "@mandel59/mojidata-api-sqljs"

import {
  createBetterSqlite3ExecutorProvider,
  createBetterSqlite3MojidataDbProvider,
} from "./better-sqlite3-node"
import {
  createNodeSqliteExecutorProvider,
  createNodeSqliteMojidataDbProvider,
} from "./node-sqlite-node"
import { createCachedPromise } from "./promise-cache"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export type NodeDbBackend = "sqljs" | "better-sqlite3" | "node:sqlite"

export function createNodeDb({
  backend = "sqljs",
}: {
  backend?: NodeDbBackend
} = {}) {
  const getMojidataDb =
    backend === "better-sqlite3"
      ? createBetterSqlite3MojidataDbProvider(mojidataDbPath)
      : backend === "node:sqlite"
        ? createNodeSqliteMojidataDbProvider(mojidataDbPath)
      : createMojidataDbProvider(() => openDatabaseFromFile(mojidataDbPath))
  const getIdsfindDb =
    backend === "better-sqlite3"
      ? createBetterSqlite3ExecutorProvider(idsfindDbPath)
      : backend === "node:sqlite"
        ? createNodeSqliteExecutorProvider(idsfindDbPath)
      : createCachedPromise(async () =>
          createSqlJsExecutor(await openDatabaseFromFile(idsfindDbPath)),
        )
  return createSqlApiDb({ getMojidataDb, getIdsfindDb })
}

export function createNodeApp(
  options?: { backend?: NodeDbBackend },
): ReturnType<typeof createApp> {
  return createApp(createNodeDb(options))
}
