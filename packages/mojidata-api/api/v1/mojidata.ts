import type { Context } from "hono"
import { castToStringArray } from "./_lib/cast"
import { getApiHeaders } from "./_lib/getApiHeaders"
import { queryExpressions } from './_lib/query-expressions'
import { getMojidataDb } from "./_lib/mojidata-db"

const fieldNames = new Set<string>(queryExpressions.map(([key, _value]) => key))

function buildQuery(selection: Set<string>) {
  const a = []
  const selectAll = selection.size === 0
  for (const [name, e] of queryExpressions) {
    if (selectAll || selection.has(name)) {
      a.push(`'${name}', ${e}`)
    }
  }
  return `SELECT json_object(${a.join(',')}) AS vs`
}

async function getMojidata(char: string, selection: string[]) {
  const db = await getMojidataDb()
  const query = buildQuery(new Set(selection))
  const stmt = db.prepare(query)
  stmt.bind({ "@ucs": char })
  const ok = stmt.step()
  const row = ok ? (stmt.getAsObject() as { vs?: string }) : {}
  stmt.free()
  return row.vs ?? null
}

export async function mojidataHandler(c: Context) {
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
  if (select.some((s) => !fieldNames.has(s))) {
    headers.forEach(({ key, value }) => c.header(key, value))
    return c.json(
      { error: { message: "invalid select", options: [...fieldNames] } },
      400,
    )
  }
  const resultsJson = await getMojidata(char, select)
  const results = typeof resultsJson === "string" ? JSON.parse(resultsJson) : null

  headers.forEach(({ key, value }) => c.header(key, value))
  return c.json({
    query: { char, select: select.length > 0 ? select : undefined },
    results,
  })
}
