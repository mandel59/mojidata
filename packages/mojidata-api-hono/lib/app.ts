import { Hono } from "hono"
import { cors } from "hono/cors"

import { createIdsfindHandler } from "../api/v1/idsfind"
import { createIvsListHandler } from "../api/v1/ivs-list"
import { createMojidataHandler } from "../api/v1/mojidata"
import { createMojidataVariantsHandler } from "../api/v1/mojidata-variants"
import type { MojidataApiDb } from "@mandel59/mojidata-api-core"

export function createApp(db: MojidataApiDb) {
  const app = new Hono()

  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "OPTIONS"],
    }),
  )

  app.get("/api/v1/mojidata", createMojidataHandler(db))
  app.get("/api/v1/ivs-list", createIvsListHandler(db))
  app.get("/api/v1/mojidata-variants", createMojidataVariantsHandler(db))
  app.get("/api/v1/idsfind", createIdsfindHandler(db))

  return app
}
