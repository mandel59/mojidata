import { createD1App, type D1DatabaseLike } from "@mandel59/mojidata-api-d1"

interface Env {
  MOJIDATA_DB: D1DatabaseLike
  IDSFIND_DB: D1DatabaseLike
}

let app:
  | ReturnType<typeof createD1App>
  | undefined

function getApp(env: Env) {
  app ??= createD1App({
    mojidataDb: env.MOJIDATA_DB,
    idsfindDb: env.IDSFIND_DB,
  })
  return app
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    return getApp(env).fetch(request, env)
  },
}
