import type { Database } from "sql.js"

import type { MojidataApiDb } from "./mojidata-api-db"
import { createIdsfind } from "./idsfind-sqljs"
import { createLibSearch } from "./libsearch"
import { buildMojidataSelectQuery } from "./mojidata-query"

type DbProvider = () => Promise<Database>

export function createSqlJsApiDb({
  getMojidataDb,
  getIdsfindDb,
}: {
  getMojidataDb: DbProvider
  getIdsfindDb: DbProvider
}): MojidataApiDb {
  const { search, filterChars } = createLibSearch(getMojidataDb)
  const idsfind = createIdsfind(getIdsfindDb)

  return {
    async getMojidataJson(char: string, select: string[]) {
      const db = await getMojidataDb()
      const query = buildMojidataSelectQuery(select)
      const stmt = db.prepare(query)
      stmt.bind({ "@ucs": char })
      const ok = stmt.step()
      const row = ok ? (stmt.getAsObject() as { vs?: string }) : {}
      stmt.free()
      return row.vs ?? null
    },
    idsfind,
    search,
    filterChars,
  }
}

