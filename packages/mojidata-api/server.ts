import { serve } from '@hono/node-server'
import { createNodeApp } from "./node"

const port = Number(process.env.PORT ?? 3001)

const app = createNodeApp()
serve({ fetch: app.fetch, port })

console.log(`mojidata-api listening on http://localhost:${port}`)
