import { createSqlApiDb } from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"
import {
  createMojidataDbProvider,
  createSqlJsExecutor,
  openDatabaseFromFile,
} from "@mandel59/mojidata-api-sqljs"

import { createCachedPromise } from "./promise-cache"

const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db")
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

export type NodeDbBackend = "sqljs"

export function createNodeDb({
  backend = "sqljs",
}: {
  backend?: NodeDbBackend
} = {}) {
  if (backend !== "sqljs") {
    throw new Error(`Unsupported Node.js backend for @mandel59/mojidata-api-runtime: ${backend}`)
  }
  const getMojidataDb = createMojidataDbProvider(() => openDatabaseFromFile(mojidataDbPath))
  const getIdsfindDb = createCachedPromise(async () =>
    createSqlJsExecutor(await openDatabaseFromFile(idsfindDbPath)),
  )
  return createSqlApiDb({ getMojidataDb, getIdsfindDb })
}

export function createNodeApp(
  options?: { backend?: NodeDbBackend },
): ReturnType<typeof createApp> {
  return createApp(createNodeDb(options))
}
