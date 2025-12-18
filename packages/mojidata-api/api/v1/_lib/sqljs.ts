import fs from "node:fs"
import path from "node:path"

import initSqlJs from "sql.js"
import type { Database, SqlJsStatic } from "sql.js"

function resolvePnpVirtualPath(filePath: string) {
  if (!path.isAbsolute(filePath)) return filePath
  try {
    const pnp = require("pnpapi") as { resolveVirtual?: (p: string) => string | null }
    return pnp.resolveVirtual?.(filePath) ?? filePath
  } catch {
    return filePath
  }
}

let sqlJsPromise: Promise<SqlJsStatic> | undefined
export function getSqlJs(): Promise<SqlJsStatic> {
  sqlJsPromise ??= (() => {
    const wasmPath = resolvePnpVirtualPath(
      require.resolve("sql.js/dist/sql-wasm.wasm"),
    )
    return initSqlJs({
      locateFile: () => wasmPath,
    })
  })()
  return sqlJsPromise
}

export async function openDatabaseFromFile(filePath: string): Promise<Database> {
  const SQL = await getSqlJs()
  const realPath = resolvePnpVirtualPath(filePath)
  const bytes = fs.readFileSync(realPath)
  return new SQL.Database(new Uint8Array(bytes))
}
