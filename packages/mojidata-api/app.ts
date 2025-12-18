import { Hono } from "hono"
import { cors } from "hono/cors"

import { idsfindHandler } from "./api/v1/idsfind"
import { mojidataHandler } from "./api/v1/mojidata"

const app = new Hono()

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
  }),
)

app.get("/api/v1/mojidata", mojidataHandler)
app.get("/api/v1/idsfind", idsfindHandler)

export default app

