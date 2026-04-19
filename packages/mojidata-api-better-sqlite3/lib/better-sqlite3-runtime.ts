import { createSqlApiDb } from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import {
  createBetterSqlite3ExecutorProvider,
  createBetterSqlite3MojidataDbProvider,
} from "./better-sqlite3-node"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export function createBetterSqlite3Db() {
  return createSqlApiDb({
    getMojidataDb: createBetterSqlite3MojidataDbProvider(mojidataDbPath),
    getIdsfindDb: createBetterSqlite3ExecutorProvider(idsfindDbPath),
  })
}

export function createBetterSqlite3App(): ReturnType<typeof createApp> {
  return createApp(createBetterSqlite3Db())
}
