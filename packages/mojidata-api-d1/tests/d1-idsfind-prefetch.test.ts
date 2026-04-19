import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { createIdsfind } from "@mandel59/mojidata-api-core/lib/idsfind-sql"
import type { SqlExecutor, SqlParams, SqlRow } from "@mandel59/mojidata-api-core"

class FakeExecutor implements SqlExecutor {
  readonly queries: Array<{ sql: string; params?: SqlParams }> = []

  async query<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T[]> {
    this.queries.push({ sql, params })

    if (sql.includes("from idsfind_fts")) {
      return [{ UCS: "信" }] as T[]
    }

    if (sql.includes("FROM idsfind\n  WHERE UCS IN (SELECT value FROM json_each($ucslist))")) {
      const lookupUcs = JSON.parse((params as { $ucslist: string }).$ucslist)
      assert.deepEqual(new Set(lookupUcs), new Set(["信", "⿰", "亻", "言"]))
      return [{ UCS: "信", IDS_tokens: "⿰ 亻 言" }] as T[]
    }

    if (sql === "SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs") {
      throw new Error(`Unexpected per-UCS idsfind lookup: ${JSON.stringify(params)}`)
    }

    throw new Error(`Unexpected idsfind SQL: ${sql}`)
  }

  async queryOne<T extends SqlRow>(): Promise<T | null> {
    throw new Error("queryOne() should not be called in this idsfind test")
  }
}

describe("createIdsfind D1-oriented prefetching", () => {
  test("prefetches audit IDS token lookups instead of issuing per-UCS queries", async () => {
    const executor = new FakeExecutor()
    const idsfind = createIdsfind(async () => executor)

    const results = await idsfind(["⿰亻言"])

    assert.deepEqual(results, ["信"])
    assert.equal(
      executor.queries.filter(({ sql }) => sql === "SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs")
        .length,
      0,
    )
    assert.equal(
      executor.queries.filter(({ sql }) =>
        sql.includes("FROM idsfind\n  WHERE UCS IN (SELECT value FROM json_each($ucslist))"),
      ).length,
      1,
    )
  })
})
