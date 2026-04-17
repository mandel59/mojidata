import { createApp } from "./hono"

import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db"
import {
  createBetterSqlite3ExecutorProvider,
  createBetterSqlite3MojidataDbProvider,
} from "./api/v1/_lib/better-sqlite3-node"
import { createSqlApiDb } from "./api/v1/_lib/mojidata-api-db-sql"
import { createMojidataDbProvider } from "./api/v1/_lib/mojidata-db"
import { createCachedPromise } from "./api/v1/_lib/promise-cache"
import { openDatabaseFromFile } from "./api/v1/_lib/sqljs-node"
import { createSqlJsExecutor } from "./api/v1/_lib/sqljs-executor"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export type NodeDbBackend = "sqljs" | "better-sqlite3"

export function createNodeDb({
  backend = "sqljs",
}: {
  backend?: NodeDbBackend
} = {}): MojidataApiDb {
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
