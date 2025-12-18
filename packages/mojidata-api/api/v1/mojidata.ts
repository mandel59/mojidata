import { VercelRequest, VercelResponse } from '@vercel/node'
import { castToStringArray } from './_lib/cast'
import { writeJson, writeObject } from './_lib/json-encoder'
import { getResponseWriter } from './_lib/get-response-writer'
import { getApiHeaders } from './_lib/getApiHeaders'
import { queryExpressions } from './_lib/query-expressions'
import { db } from './_lib/mojidata-db'

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

function getMojidata(char: string, selection: string[]) {
  const query = buildQuery(new Set(selection))
  const stmt = db
    .prepare<{ ucs: string }, ['vs'], { vs: string }>(query)
    .pluck()
  return stmt.get({ ucs: char })
}

export default async (request: VercelRequest, response: VercelResponse) => {
  let { char, select } = request.query
  const headers = getApiHeaders()
  if (!char || typeof char !== 'string') {
    response.status(400)
    headers.forEach(({ key, value }) => response.setHeader(key, value))
    response.send(JSON.stringify({ error: { message: 'char is required' } }))
    return
  }
  if (typeof char === "string" && char.length > 1) {
    const m = /U\+?([0-9A-F]+)/i.exec(char)
    if (m) {
      char = String.fromCodePoint(parseInt(m[1], 16))
    }
  }
  if ([...char].length !== 1) {
    response.status(400)
    headers.forEach(({ key, value }) => response.setHeader(key, value))
    response.send(
      JSON.stringify({ error: { message: 'char must be a single character' } }),
    )
    return
  }
  select = castToStringArray(select)
  if (select.some((s) => !fieldNames.has(s))) {
    response.status(400)
    headers.forEach(({ key, value }) => response.setHeader(key, value))
    response.send(
      JSON.stringify({
        error: { message: 'invalid select', options: [...fieldNames] },
      }),
    )
    return
  }
  const results = getMojidata(char, select)
  const write = getResponseWriter(response)
  response.status(200)
  headers.forEach(({ key, value }) => response.setHeader(key, value))
  await writeObject(write, [
    ['query', { char, select: select.length > 0 ? select : undefined }],
    ['results', async () => await writeJson(write, results)],
  ])
  response.end()
}
