import {
  createSqlApiDb,
  type CreateIdsfindOptions,
} from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import {
  createBetterSqlite3ExecutorProvider,
  createBetterSqlite3MojidataDbProvider,
} from "./better-sqlite3-node"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb-fts5/idsfind.db")

export function createBetterSqlite3Db(idsfindOptions: CreateIdsfindOptions = {}) {
  return createSqlApiDb({
    getMojidataDb: createBetterSqlite3MojidataDbProvider(mojidataDbPath),
    getIdsfindDb: createBetterSqlite3ExecutorProvider(idsfindDbPath),
    idsfindOptions,
  })
}

export function createBetterSqlite3App(idsfindOptions: CreateIdsfindOptions = {}): ReturnType<typeof createApp> {
  return createApp(createBetterSqlite3Db(idsfindOptions))
}
