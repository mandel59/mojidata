import { queryExpressions } from "./query-expressions"

export const mojidataFieldNames = new Set<string>(
  queryExpressions.map(([key, _value]) => key),
)

export const mojidataComputedFieldNames = new Set<string>(["unihan_rs"])

export function getSqlMojidataFields(selection: Iterable<string>) {
  const selected = new Set(selection)
  const selectAll = selected.size === 0
  return queryExpressions.flatMap(([name, e]) => {
    if (mojidataComputedFieldNames.has(name)) {
      return []
    }
    if (selectAll || selected.has(name)) {
      return [[name, e] as const]
    }
    return []
  })
}

export function buildMojidataSelectQuery(selection: Iterable<string>) {
  const a = getSqlMojidataFields(selection).map(
    ([name, e]) => `'${name}', ${e}`,
  )
  return `SELECT json_object(${a.join(",")}) AS vs`
}
