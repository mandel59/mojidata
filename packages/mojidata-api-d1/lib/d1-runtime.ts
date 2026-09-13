import {
  createSqlApiDb,
  type CreateIdsfindOptions,
  type SqlExecutor,
} from "@mandel59/mojidata-api-core"
import { createApp } from "@mandel59/mojidata-api-hono"

import { createD1Executor, type D1DatabaseLike } from "./d1-executor"

export interface MojidataApiD1Env {
  MOJIDATA_DB: D1DatabaseLike
  IDSFIND_DB: D1DatabaseLike
}

function createExecutorProvider(db: D1DatabaseLike) {
  let executor: SqlExecutor | undefined
  return async () => {
    executor ??= createD1Executor(db)
    return executor
  }
}

export interface CreateD1DbOptions {
  mojidataDb: D1DatabaseLike
  idsfindDb: D1DatabaseLike
  idsfindOptions?: CreateIdsfindOptions
}

export function createD1Db({
  mojidataDb,
  idsfindDb,
  idsfindOptions,
}: CreateD1DbOptions) {
  return createSqlApiDb({
    getMojidataDb: createExecutorProvider(mojidataDb),
    getIdsfindDb: createExecutorProvider(idsfindDb),
    idsfindOptions,
  })
}

export function createD1DbFromEnv(
  env: MojidataApiD1Env,
  idsfindOptions: CreateIdsfindOptions = {},
) {
  return createD1Db({
    mojidataDb: env.MOJIDATA_DB,
    idsfindDb: env.IDSFIND_DB,
    idsfindOptions,
  })
}

export function createD1App(options: CreateD1DbOptions): ReturnType<typeof createApp> {
  return createApp(createD1Db(options))
}

export function createD1AppFromEnv(
  env: MojidataApiD1Env,
  idsfindOptions: CreateIdsfindOptions = {},
): ReturnType<typeof createApp> {
  return createApp(createD1DbFromEnv(env, idsfindOptions))
}

export function createD1FetchHandler(idsfindOptions: CreateIdsfindOptions = {}) {
  const appByEnv = new WeakMap<MojidataApiD1Env, ReturnType<typeof createApp>>()

  return (
    request: Request,
    env: MojidataApiD1Env,
  ): Promise<Response> | Response => {
    let app = appByEnv.get(env)
    if (app === undefined) {
      app = createD1AppFromEnv(env, idsfindOptions)
      appByEnv.set(env, app)
    }
    return app.fetch(request, env)
  }
}
