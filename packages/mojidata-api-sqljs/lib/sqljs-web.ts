import initSqlJs from "sql.js"
import type { Database, SqlJsStatic } from "sql.js"

const sqlJsByWasmUrl = new Map<string, Promise<SqlJsStatic>>()

export function getSqlJsWeb(wasmUrl: string): Promise<SqlJsStatic> {
  const key = wasmUrl || "sql-wasm.wasm"
  const existing = sqlJsByWasmUrl.get(key)
  if (existing) return existing

  const created = initSqlJs({
    locateFile: () => key,
  })
  sqlJsByWasmUrl.set(key, created)
  return created
}

export async function openDatabaseFromUrl(
  dbUrl: string,
  wasmUrl: string,
): Promise<Database> {
  const SQL = await getSqlJsWeb(wasmUrl)
  const res = await fetch(dbUrl)
  if (!res.ok) {
    throw new Error(
      `Failed to fetch DB: ${dbUrl} (${res.status} ${res.statusText})`,
    )
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  return new SQL.Database(bytes)
}
