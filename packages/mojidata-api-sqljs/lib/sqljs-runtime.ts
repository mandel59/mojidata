import { createSqlApiDb } from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import { createMojidataDbProvider } from "./mojidata-db"
import { createCachedPromise } from "./promise-cache"
import { createSqlJsExecutor } from "./sqljs-executor"
import { openDatabaseFromFile } from "./sqljs-node"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export function createSqlJsDb() {
  const getMojidataDb = createMojidataDbProvider(() => openDatabaseFromFile(mojidataDbPath))
  const getIdsfindDb = createCachedPromise(async () =>
    createSqlJsExecutor(await openDatabaseFromFile(idsfindDbPath)),
  )
  return createSqlApiDb({ getMojidataDb, getIdsfindDb })
}

export function createSqlJsApp(): ReturnType<typeof createApp> {
  return createApp(createSqlJsDb())
}
