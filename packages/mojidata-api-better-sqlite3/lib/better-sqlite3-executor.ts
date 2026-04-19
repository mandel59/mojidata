import type BetterSqlite3Database from "better-sqlite3"

import type { SqlExecutor, SqlParams, SqlRow } from "@mandel59/mojidata-api-core"

function normalizeNamedParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key.replace(/^[:@$]/u, ""), value]),
  )
}

function applyParams<T>(
  stmt: {
    all(...params: unknown[]): T[]
    get(...params: unknown[]): T | undefined
  },
  method: "all" | "get",
  params?: SqlParams,
): T[] | T | undefined {
  if (params === undefined) {
    return stmt[method]()
  }
  if (Array.isArray(params)) {
    return stmt[method](...params)
  }
  return stmt[method](normalizeNamedParams(params))
}

export function createBetterSqlite3Executor(
  db: BetterSqlite3Database.Database,
): SqlExecutor {
  return {
    async query<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T[]> {
      const stmt = db.prepare<T[]>(sql)
      return (applyParams(stmt, "all", params) as T[]) ?? []
    },
    async queryOne<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T | null> {
      const stmt = db.prepare<T>(sql)
      return (applyParams(stmt, "get", params) as T | undefined) ?? null
    },
  }
}
