import assert from "node:assert/strict"
import { describe, test } from "node:test"

import Database from "better-sqlite3"

import { createBetterSqlite3Executor } from "../api/v1/_lib/better-sqlite3-executor"

describe("createBetterSqlite3Executor", () => {
  test("supports positional parameters with query()", async () => {
    const db = new Database(":memory:")
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)")
    db.exec("INSERT INTO items (value) VALUES ('alpha'), ('beta')")

    const executor = createBetterSqlite3Executor(db)
    const rows = await executor.query<{ value?: string }>(
      "SELECT value FROM items WHERE id >= ? ORDER BY id",
      [1],
    )

    assert.deepEqual(rows, [{ value: "alpha" }, { value: "beta" }])
    db.close()
  })

  test("supports named parameters with queryOne()", async () => {
    const db = new Database(":memory:")
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)")
    db.exec("INSERT INTO items (value) VALUES ('alpha'), ('beta')")

    const executor = createBetterSqlite3Executor(db)
    const row = await executor.queryOne<{ value?: string }>(
      "SELECT value FROM items WHERE id = $id",
      { $id: 2 },
    )

    assert.deepEqual(row, { value: "beta" })
    db.close()
  })

  test("returns null from queryOne() when no rows match", async () => {
    const db = new Database(":memory:")
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)")

    const executor = createBetterSqlite3Executor(db)
    const row = await executor.queryOne<{ value?: string }>(
      "SELECT value FROM items WHERE id = ?",
      [1],
    )

    assert.equal(row, null)
    db.close()
  })
})
