import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { DatabaseSync } from "node:sqlite"

import { createNodeSqliteExecutor } from "../index"

function toPlainObject<T extends object>(value: T): T {
  return { ...value }
}

describe("createNodeSqliteExecutor", () => {
  test("supports positional parameters with query()", async () => {
    const db = new DatabaseSync(":memory:")
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)")
    db.exec("INSERT INTO items (value) VALUES ('alpha'), ('beta')")

    const executor = createNodeSqliteExecutor(db)
    const rows = await executor.query<{ value?: string }>(
      "SELECT value FROM items WHERE id >= ? ORDER BY id",
      [1],
    )

    assert.deepEqual(rows.map((row) => toPlainObject(row)), [
      { value: "alpha" },
      { value: "beta" },
    ])
    db.close()
  })

  test("supports named parameters with queryOne()", async () => {
    const db = new DatabaseSync(":memory:")
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)")
    db.exec("INSERT INTO items (value) VALUES ('alpha'), ('beta')")

    const executor = createNodeSqliteExecutor(db)
    const row = await executor.queryOne<{ value?: string }>(
      "SELECT value FROM items WHERE id = $id",
      { $id: 2 },
    )

    assert.deepEqual(row && toPlainObject(row), { value: "beta" })
    db.close()
  })
})
