import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { createD1Executor, rewriteNamedParamsForD1 } from "../index"
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../index"

class FakePreparedStatement implements D1PreparedStatementLike {
  public boundValues: unknown[] = []

  constructor(
    readonly sql: string,
    private readonly db: FakeD1Database,
  ) {}

  bind(...values: unknown[]) {
    this.boundValues = values
    return this
  }

  async run<T extends Record<string, unknown>>() {
    this.db.executions.push({ sql: this.sql, values: this.boundValues })
    return { results: (this.db.nextRunResults.shift() ?? []) as T[] } satisfies D1ResultLike<T>
  }

  async first<T>() {
    this.db.executions.push({ sql: this.sql, values: this.boundValues })
    return (this.db.nextFirstResults.shift() ?? null) as T | null
  }
}

class FakeD1Database implements D1DatabaseLike {
  readonly preparedSql: string[] = []
  readonly executions: Array<{ sql: string; values: unknown[] }> = []
  readonly nextRunResults: Array<Record<string, unknown>[]> = []
  readonly nextFirstResults: Array<Record<string, unknown> | null> = []

  prepare(sql: string) {
    this.preparedSql.push(sql)
    return new FakePreparedStatement(sql, this)
  }
}

describe("rewriteNamedParamsForD1", () => {
  test("rewrites named parameters to ordered placeholders", () => {
    const rewritten = rewriteNamedParamsForD1(
      "SELECT value FROM items WHERE id = $id OR parent_id = $id",
      { $id: 2 },
    )

    assert.equal(
      rewritten.sql,
      "SELECT value FROM items WHERE id = ?1 OR parent_id = ?1",
    )
    assert.deepEqual(rewritten.values, [2])
  })

  test("ignores placeholder-like text inside strings and comments", () => {
    const rewritten = rewriteNamedParamsForD1(
      "SELECT '$id' AS literal, value FROM items WHERE id = $id -- @ignored\nAND note = '@skip'",
      { $id: 5 },
    )

    assert.equal(
      rewritten.sql,
      "SELECT '$id' AS literal, value FROM items WHERE id = ?1 -- @ignored\nAND note = '@skip'",
    )
    assert.deepEqual(rewritten.values, [5])
  })
})

describe("createD1Executor", () => {
  test("supports positional parameters with query()", async () => {
    const db = new FakeD1Database()
    db.nextRunResults.push([{ value: "alpha" }, { value: "beta" }])

    const executor = createD1Executor(db)
    const rows = await executor.query<{ value?: string }>(
      "SELECT value FROM items WHERE id >= ? ORDER BY id",
      [1],
    )

    assert.deepEqual(rows, [{ value: "alpha" }, { value: "beta" }])
    assert.deepEqual(db.preparedSql, ["SELECT value FROM items WHERE id >= ? ORDER BY id"])
    assert.deepEqual(db.executions, [
      {
        sql: "SELECT value FROM items WHERE id >= ? ORDER BY id",
        values: [1],
      },
    ])
  })

  test("supports named parameters with queryOne()", async () => {
    const db = new FakeD1Database()
    db.nextFirstResults.push({ value: "beta" })

    const executor = createD1Executor(db)
    const row = await executor.queryOne<{ value?: string }>(
      "SELECT value FROM items WHERE id = $id",
      { $id: 2 },
    )

    assert.deepEqual(row, { value: "beta" })
    assert.deepEqual(db.preparedSql, ["SELECT value FROM items WHERE id = ?1"])
    assert.deepEqual(db.executions, [
      {
        sql: "SELECT value FROM items WHERE id = ?1",
        values: [2],
      },
    ])
  })

  test("returns null from queryOne() when D1 returns no rows", async () => {
    const db = new FakeD1Database()
    db.nextFirstResults.push(null)

    const executor = createD1Executor(db)
    const row = await executor.queryOne<{ value?: string }>(
      "SELECT value FROM items WHERE id = @id",
      { "@id": 99 },
    )

    assert.equal(row, null)
  })
})
