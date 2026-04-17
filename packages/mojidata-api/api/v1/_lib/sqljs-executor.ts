import type { Database } from "sql.js"

import type { SqlExecutor, SqlParams, SqlRow } from "./sql-executor"

function bindParams(stmt: { bind(values?: unknown): void }, params?: SqlParams) {
  if (params === undefined) {
    return
  }
  stmt.bind(params as unknown)
}

export function createSqlJsExecutor(db: Database): SqlExecutor {
  return {
    async query<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T[]> {
      const stmt = db.prepare(sql)
      try {
        bindParams(stmt, params)
        const out: T[] = []
        while (stmt.step()) {
          out.push(stmt.getAsObject() as T)
        }
        return out
      } finally {
        stmt.free()
      }
    },
    async queryOne<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T | null> {
      const stmt = db.prepare(sql)
      try {
        bindParams(stmt, params)
        if (!stmt.step()) {
          return null
        }
        return stmt.getAsObject() as T
      } finally {
        stmt.free()
      }
    },
  }
}
