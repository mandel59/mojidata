import { createApp } from "./app"

import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db"
import { createSqlJsApiDb } from "./api/v1/_lib/mojidata-api-db-sqljs"
import { createMojidataDbProvider } from "./api/v1/_lib/mojidata-db"
import { createCachedPromise } from "./api/v1/_lib/promise-cache"
import { openDatabaseFromFile } from "./api/v1/_lib/sqljs-node"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export function createNodeDb(): MojidataApiDb {
  const getMojidataDb = createMojidataDbProvider(() =>
    openDatabaseFromFile(mojidataDbPath),
  )
  const getIdsfindDb = createCachedPromise(() =>
    openDatabaseFromFile(idsfindDbPath),
  )
  return createSqlJsApiDb({ getMojidataDb, getIdsfindDb })
}

export function createNodeApp() {
  return createApp(createNodeDb())
}

