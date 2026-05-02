import type { BindingSpec, Database } from "@sqlite.org/sqlite-wasm"

import type { SqlExecutor, SqlParams, SqlRow } from "@mandel59/mojidata-api-core"

export type SqliteWasmDatabaseLike = Pick<Database, "selectObject" | "selectObjects">

function bindParams(params?: SqlParams): BindingSpec | undefined {
  return params as BindingSpec | undefined
}

function normalizeRow<T>(row: T): T {
  if (row && typeof row === "object" && Object.getPrototypeOf(row) === null) {
    return { ...row } as T
  }
  return row
}

export function createSqliteWasmExecutor(db: SqliteWasmDatabaseLike): SqlExecutor {
  return {
    async query<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T[]> {
      return (db.selectObjects(sql, bindParams(params)) as T[]).map((row) =>
        normalizeRow(row),
      )
    },
    async queryOne<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T | null> {
      const row = (db.selectObject(sql, bindParams(params)) as T | undefined) ?? null
      return row === null ? null : normalizeRow(row)
    },
  }
}
