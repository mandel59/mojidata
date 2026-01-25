import type { Context } from "hono"

import { castToStringArray } from "./_lib/cast"
import { getApiHeaders } from "./_lib/getApiHeaders"
import type { MojidataApiDb } from "./_lib/mojidata-api-db"
import { parseSingleChar } from "./_lib/parse-char"

export function createMojidataVariantsHandler(db: MojidataApiDb) {
  return async function mojidataVariantsHandler(c: Context) {
    const headers = getApiHeaders()
    const charsRaw = castToStringArray(c.req.queries("char") ?? [])
    if (charsRaw.length === 0) {
      headers.forEach(({ key, value }) => c.header(key, value))
      return c.json({ error: { message: "char is required" } }, 400)
    }

    const chars: string[] = []
    for (const input of charsRaw) {
      if (typeof input !== "string") continue
      const char = parseSingleChar(input)
      if (!char) {
        headers.forEach(({ key, value }) => c.header(key, value))
        return c.json(
          { error: { message: "char must be a single character" } },
          400,
        )
      }
      chars.push(char)
    }

    const results = await db.getMojidataVariantRels(chars)
    headers.forEach(({ key, value }) => c.header(key, value))
    return c.json({ query: { char: chars }, results })
  }
}

