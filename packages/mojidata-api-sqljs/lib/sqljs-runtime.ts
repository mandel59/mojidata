import {
  createSqlApiDb,
  type CreateIdsfindOptions,
} from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import { createMojidataDbProvider } from "./mojidata-db"
import { createCachedPromise } from "./promise-cache"
import { createSqlJsExecutor } from "./sqljs-executor"
import { openDatabaseFromFile } from "./sqljs-node"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export function createSqlJsDb(idsfindOptions: CreateIdsfindOptions = {}) {
  const getMojidataDb = createMojidataDbProvider(() => openDatabaseFromFile(mojidataDbPath))
  const getIdsfindDb = createCachedPromise(async () =>
    createSqlJsExecutor(await openDatabaseFromFile(idsfindDbPath)),
  )
  return createSqlApiDb({ getMojidataDb, getIdsfindDb, idsfindOptions })
}

export function createSqlJsApp(idsfindOptions: CreateIdsfindOptions = {}): ReturnType<typeof createApp> {
  return createApp(createSqlJsDb(idsfindOptions))
}
