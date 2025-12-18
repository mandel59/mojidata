import { Hono } from "hono"
import { cors } from "hono/cors"

import { createIdsfindHandler } from "./api/v1/idsfind"
import { createMojidataHandler } from "./api/v1/mojidata"
import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db"

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
  app.get("/api/v1/idsfind", createIdsfindHandler(db))

  return app
}
