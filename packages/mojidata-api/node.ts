import { createApp } from "./hono"

import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db"
import { createSqlApiDb } from "./api/v1/_lib/mojidata-api-db-sql"
import { createMojidataDbProvider } from "./api/v1/_lib/mojidata-db"
import { createCachedPromise } from "./api/v1/_lib/promise-cache"
import { openDatabaseFromFile } from "./api/v1/_lib/sqljs-node"
import { createSqlJsExecutor } from "./api/v1/_lib/sqljs-executor"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export function createNodeDb(): MojidataApiDb {
  const getMojidataDb = createMojidataDbProvider(() =>
    openDatabaseFromFile(mojidataDbPath),
  )
  const getIdsfindDb = createCachedPromise(async () =>
    createSqlJsExecutor(await openDatabaseFromFile(idsfindDbPath)),
  )
  return createSqlApiDb({ getMojidataDb, getIdsfindDb })
}

export function createNodeApp() {
  return createApp(createNodeDb())
}
