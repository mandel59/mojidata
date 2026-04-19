import { createSqlApiDb } from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import {
  createNodeSqliteExecutorProvider,
  createNodeSqliteMojidataDbProvider,
} from "./node-sqlite-node"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export function createNodeSqliteDb() {
  return createSqlApiDb({
    getMojidataDb: createNodeSqliteMojidataDbProvider(mojidataDbPath),
    getIdsfindDb: createNodeSqliteExecutorProvider(idsfindDbPath),
  })
}

export function createNodeSqliteApp(): ReturnType<typeof createApp> {
  return createApp(createNodeSqliteDb())
}
