import { createSqlApiDb, type SqlExecutor } from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import { createD1Executor, type D1DatabaseLike } from "./d1-executor"

function createExecutorProvider(db: D1DatabaseLike) {
  let executor: SqlExecutor | undefined
  return async () => {
    executor ??= createD1Executor(db)
    return executor
  }
}

export function createD1Db({
  mojidataDb,
  idsfindDb,
}: {
  mojidataDb: D1DatabaseLike
  idsfindDb: D1DatabaseLike
}) {
  return createSqlApiDb({
    getMojidataDb: createExecutorProvider(mojidataDb),
    getIdsfindDb: createExecutorProvider(idsfindDb),
  })
}

export function createD1App(options: {
  mojidataDb: D1DatabaseLike
  idsfindDb: D1DatabaseLike
}): ReturnType<typeof createApp> {
  return createApp(createD1Db(options))
}
