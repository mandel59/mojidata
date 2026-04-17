import { createCachedPromise } from "../../api/v1/_lib/promise-cache"
import {
  createBetterSqlite3ExecutorProvider,
  createBetterSqlite3MojidataDbProvider,
} from "../../api/v1/_lib/better-sqlite3-node"
import { createApp } from "../app"
import { createSqlApiDb } from "../core"
import { createMojidataDbProvider, createSqlJsExecutor, openDatabaseFromFile } from "../adapter/sqljs"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export type NodeDbBackend = "sqljs" | "better-sqlite3"

export function createNodeDb({
  backend = "sqljs",
}: {
  backend?: NodeDbBackend
} = {}) {
  const getMojidataDb =
    backend === "better-sqlite3"
      ? createBetterSqlite3MojidataDbProvider(mojidataDbPath)
      : createMojidataDbProvider(() => openDatabaseFromFile(mojidataDbPath))
  const getIdsfindDb =
    backend === "better-sqlite3"
      ? createBetterSqlite3ExecutorProvider(idsfindDbPath)
      : createCachedPromise(async () =>
          createSqlJsExecutor(await openDatabaseFromFile(idsfindDbPath)),
        )
  return createSqlApiDb({ getMojidataDb, getIdsfindDb })
}

export function createNodeApp(options?: { backend?: NodeDbBackend }) {
  return createApp(createNodeDb(options))
}
