import { queryExpressions } from "./query-expressions"

export const mojidataFieldNames = new Set<string>(
  queryExpressions.map(([key, _value]) => key),
)

export function buildMojidataSelectQuery(selection: Iterable<string>) {
  const selected = new Set(selection)
  const a: string[] = []
  const selectAll = selected.size === 0
  for (const [name, e] of queryExpressions) {
    if (selectAll || selected.has(name)) {
      a.push(`'${name}', ${e}`)
    }
  }
  return `SELECT json_object(${a.join(",")}) AS vs`
}
