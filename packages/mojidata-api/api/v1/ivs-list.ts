import type { Context } from "hono"

import { getApiHeaders } from "./_lib/getApiHeaders"
import type { MojidataApiDb } from "./_lib/mojidata-api-db"
import { parseSingleChar } from "./_lib/parse-char"

export function createIvsListHandler(db: MojidataApiDb) {
  return async function ivsListHandler(c: Context) {
    const headers = getApiHeaders()
    const input = c.req.query("char")
    if (!input || typeof input !== "string") {
      headers.forEach(({ key, value }) => c.header(key, value))
      return c.json({ error: { message: "char is required" } }, 400)
    }

    const char = parseSingleChar(input)
    if (!char) {
      headers.forEach(({ key, value }) => c.header(key, value))
      return c.json(
        { error: { message: "char must be a single character" } },
        400,
      )
    }

    const results = await db.getIvsList(char)
    headers.forEach(({ key, value }) => c.header(key, value))
    return c.json({ query: { char }, results })
  }
}

