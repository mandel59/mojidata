import {
  createSqlApiDb,
  type CreateIdsfindOptions,
} from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import {
  createNodeSqliteExecutorProvider,
  createNodeSqliteMojidataDbProvider,
} from "./node-sqlite-node"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb-fts5/idsfind.db")

export function createNodeSqliteDb(idsfindOptions: CreateIdsfindOptions = {}) {
  return createSqlApiDb({
    getMojidataDb: createNodeSqliteMojidataDbProvider(mojidataDbPath),
    getIdsfindDb: createNodeSqliteExecutorProvider(idsfindDbPath),
    idsfindOptions,
  })
}

export function createNodeSqliteApp(idsfindOptions: CreateIdsfindOptions = {}): ReturnType<typeof createApp> {
  return createApp(createNodeSqliteDb(idsfindOptions))
}
