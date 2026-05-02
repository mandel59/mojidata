import assert from "node:assert/strict"
import { describe, test } from "node:test"

import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import {
  createSqliteWasmExecutor,
  installMojidataSqliteWasmFunctions,
  isOpfsSAHPoolSupported,
  tryEnsureOpfsSAHPoolDatabase,
  tryInstallOpfsSAHPool,
  type SqliteWasmSAHPoolUtil,
} from "../index.js"

describe("createSqliteWasmExecutor", () => {
  test("supports positional and named parameters", async () => {
    const sqlite3 = await sqlite3InitModule()
    const db = new sqlite3.oo1.DB(":memory:")
    try {
      db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)")
      db.exec("INSERT INTO items (value) VALUES ('alpha'), ('beta')")

      const executor = createSqliteWasmExecutor(db)
      const rows = await executor.query<{ value?: string }>(
        "SELECT value FROM items WHERE id >= ? ORDER BY id",
        [1],
      )
      const row = await executor.queryOne<{ value?: string }>(
        "SELECT value FROM items WHERE id = $id",
        { $id: 2 },
      )

      assert.deepEqual(rows, [{ value: "alpha" }, { value: "beta" }])
      assert.deepEqual(row, { value: "beta" })
    } finally {
      db.close()
    }
  })

  test("returns null when queryOne has no rows", async () => {
    const sqlite3 = await sqlite3InitModule()
    const db = new sqlite3.oo1.DB(":memory:")
    try {
      const executor = createSqliteWasmExecutor(db)
      assert.equal(await executor.queryOne("SELECT 1 WHERE 0"), null)
    } finally {
      db.close()
    }
  })
})

describe("installMojidataSqliteWasmFunctions", () => {
  test("registers mojidata SQL functions", async () => {
    const sqlite3 = await sqlite3InitModule()
    const db = new sqlite3.oo1.DB(":memory:")
    try {
      installMojidataSqliteWasmFunctions(db)
      const executor = createSqliteWasmExecutor(db)
      const row = await executor.queryOne<{
        regexp?: number
        parse_int?: number
        regexp_all?: string
      }>(
        "SELECT regexp('[0-9]+', 'abc123') AS regexp, parse_int('10', 16) AS parse_int, regexp_all('a1b2', '[0-9]') AS regexp_all",
      )

      assert.equal(row?.regexp, 1)
      assert.equal(row?.parse_int, 16)
      assert.match(row?.regexp_all ?? "", /"substr":"1"/)
      assert.match(row?.regexp_all ?? "", /"substr":"2"/)
    } finally {
      db.close()
    }
  })
})

describe("OPFS fallback helpers", () => {
  test("reports unsupported OPFS contexts without throwing", async () => {
    assert.equal(isOpfsSAHPoolSupported(), false)
    const sqlite3 = await sqlite3InitModule()

    const installResult = await tryInstallOpfsSAHPool(sqlite3)
    assert.equal(installResult.ok, false)
    if (!installResult.ok) {
      assert.equal(installResult.reason, "unsupported")
    }

    const result = await tryEnsureOpfsSAHPoolDatabase({} as SqliteWasmSAHPoolUtil, {
      name: "/mojidata/moji.db",
      assetUrl: "https://example.test/moji.db",
      assetVersion: "test",
    })

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, "unsupported")
    }
  })
})
