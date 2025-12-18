import type { Context } from "hono"
import { castToStringArray } from "./_lib/cast"
import { getApiHeaders } from "./_lib/getApiHeaders"
import type { MojidataApiDb } from "./_lib/mojidata-api-db"
import { mojidataFieldNames } from "./_lib/mojidata-query"

export function createMojidataHandler(db: MojidataApiDb) {
  return async function mojidataHandler(c: Context) {
  let char = c.req.query("char")
  let select = c.req.queries("select") ?? []
  const headers = getApiHeaders()
  if (!char || typeof char !== "string") {
    headers.forEach(({ key, value }) => c.header(key, value))
    return c.json({ error: { message: "char is required" } }, 400)
  }
  if (typeof char === "string" && char.length > 1) {
    const m = /U\+?([0-9A-F]+)/i.exec(char)
    if (m) {
      char = String.fromCodePoint(parseInt(m[1], 16))
    }
  }
  if ([...char].length !== 1) {
    headers.forEach(({ key, value }) => c.header(key, value))
    return c.json(
      { error: { message: "char must be a single character" } },
      400,
    )
  }
  select = castToStringArray(select)
  if (select.some((s) => !mojidataFieldNames.has(s))) {
    headers.forEach(({ key, value }) => c.header(key, value))
    return c.json(
      { error: { message: "invalid select", options: [...mojidataFieldNames] } },
      400,
    )
  }
  const resultsJson = await db.getMojidataJson(char, select)
  const results = typeof resultsJson === "string" ? JSON.parse(resultsJson) : null

  headers.forEach(({ key, value }) => c.header(key, value))
  return c.json({
    query: { char, select: select.length > 0 ? select : undefined },
    results,
  })
  }
}
