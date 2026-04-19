import type { DatabaseSync } from "node:sqlite"

import type { SqlExecutor, SqlParams, SqlRow } from "@mandel59/mojidata-api-core"

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
  return stmt[method](params)
}

function normalizeRow<T>(row: T): T {
  if (row && typeof row === "object" && Object.getPrototypeOf(row) === null) {
    return { ...row } as T
  }
  return row
}

export function createNodeSqliteExecutor(db: DatabaseSync): SqlExecutor {
  return {
    async query<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T[]> {
      const stmt = db.prepare(sql)
      return ((applyParams(stmt, "all", params) as T[] | undefined) ?? []).map((row) =>
        normalizeRow(row),
      )
    },
    async queryOne<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T | null> {
      const stmt = db.prepare(sql)
      const row = (applyParams(stmt, "get", params) as T | undefined) ?? null
      return row === null ? null : normalizeRow(row)
    },
  }
}
