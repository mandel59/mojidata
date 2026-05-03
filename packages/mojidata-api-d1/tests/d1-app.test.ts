import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { createD1App, createD1AppFromEnv, createD1FetchHandler } from "../index"
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  MojidataApiD1Env,
} from "../index"

type ExecuteMode = "run" | "first"

class FakePreparedStatement implements D1PreparedStatementLike {
  private boundValues: unknown[] = []

  constructor(
    private readonly sql: string,
    private readonly db: FakeD1Database,
  ) {}

  bind(...values: unknown[]) {
    this.boundValues = values
    return this
  }

  async run<T extends Record<string, unknown>>() {
    const result = this.db.execute(this.sql, this.boundValues, "run")
    return { results: (result ?? []) as T[] } satisfies D1ResultLike<T>
  }

  async first<T>() {
    return (this.db.execute(this.sql, this.boundValues, "first") ?? null) as T | null
  }
}

class FakeD1Database implements D1DatabaseLike {
  readonly preparedSql: string[] = []
  readonly executions: Array<{ sql: string; values: unknown[]; mode: ExecuteMode }> = []

  constructor(
    private readonly respond: (sql: string, values: unknown[], mode: ExecuteMode) => unknown,
  ) {}

  prepare(sql: string) {
    this.preparedSql.push(sql)
    return new FakePreparedStatement(sql, this)
  }

  execute(sql: string, values: unknown[], mode: ExecuteMode) {
    this.executions.push({ sql, values, mode })
    return this.respond(sql, values, mode)
  }
}

function createFakeMojidataDb() {
  return new FakeD1Database((sql, values, mode) => {
    const normalizedSql = sql.replaceAll(/\s+/g, " ").trim()

    if (normalizedSql.startsWith("SELECT json_object('char', ?1,'UCS'")) {
      assert.equal(mode, "first")
      assert.deepEqual(values, ["漢"])
      return { vs: JSON.stringify({ UCS: "U+6F22" }) }
    }

    if (normalizedSql.startsWith("SELECT json_object('UCS'")) {
      assert.equal(mode, "first")
      assert.deepEqual(values, ["漢"])
      return { vs: JSON.stringify({ UCS: "U+6F22" }) }
    }

    if (normalizedSql.includes("FROM chars")) {
      assert.equal(mode, "first")
      assert.deepEqual(values, ["漢"])
      return { vs: JSON.stringify({ UCS: "U+6F22" }) }
    }

    if (
      normalizedSql.includes(
        "printf('%04X %04X', unicode(IVS), unicode(substr(IVS, 2))) AS unicode",
      )
    ) {
      assert.equal(mode, "run")
      assert.deepEqual(values, ["漢"])
      return [
        {
          IVS: "漢󠄀",
          unicode: "6F22 E0100",
          collection: "ExampleCollection",
          code: "CID+1234",
        },
      ]
    }

    if (normalizedSql === "SELECT value FROM unihan_kRSAdobe_Japan1_6 WHERE UCS = ?1") {
      assert.equal(mode, "first")
      assert.deepEqual(values, ["漢"])
      return null
    }

    if (normalizedSql === "SELECT value FROM unihan_kRSUnicode WHERE UCS = ?1") {
      assert.equal(mode, "first")
      assert.deepEqual(values, ["漢"])
      return null
    }

    if (
      normalizedSql.includes("SELECT 部首, 部首漢字, radical, radical_CJKUI FROM radicals WHERE")
    ) {
      assert.equal(mode, "run")
      assert.deepEqual(values, ["[]", "[]"])
      return []
    }

    throw new Error(`Unexpected mojidata D1 SQL: ${sql}`)
  })
}

function createFakeIdsfindDb() {
  return new FakeD1Database((sql, values, mode) => {
    const normalizedSql = sql.replaceAll(/\s+/g, " ").trim()

    if (sql.includes("from idsfind_fts")) {
      assert.equal(mode, "run")
      assert.equal(values.length, 1)
      assert.equal(typeof values[0], "string")
      return [{ UCS: "信" }]
    }

    if (
      normalizedSql ===
      "SELECT UCS, IDS_tokens FROM idsfind WHERE UCS IN (SELECT value FROM json_each(?1))"
    ) {
      assert.equal(mode, "run")
      assert.deepEqual(new Set(JSON.parse(String(values[0]))), new Set(["信", "⿰", "亻", "言"]))
      return [{ UCS: "信", IDS_tokens: "⿰ 亻 言" }]
    }

    if (sql === "SELECT IDS_tokens FROM idsfind WHERE UCS = ?1") {
      assert.equal(mode, "run")
      assert.equal(values.length, 1)
      if (values[0] === "信") {
        return [{ IDS_tokens: "⿰ 亻 言" }]
      }
      return []
    }

    throw new Error(`Unexpected idsfind D1 SQL: ${sql}`)
  })
}

describe("createD1App", () => {
  test("serves selected mojidata-api endpoints through D1-backed bindings", async () => {
    const mojidataDb = createFakeMojidataDb()
    const idsfindDb = createFakeIdsfindDb()
    const app = createD1App({ mojidataDb, idsfindDb })

    {
      const response = await app.request("http://example.test/api/v1/mojidata?char=漢&select=UCS")
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("access-control-allow-origin"), "*")
      assert.equal(response.headers.get("cache-control"), "no-store")
      const json = await response.json()
      assert.deepEqual(json, {
        query: { char: "漢", select: ["UCS"] },
        results: { UCS: "U+6F22" },
      })
    }

    {
      const response = await app.request("http://example.test/api/v1/mojidata?char=漢")
      assert.equal(response.status, 200)
      const json = await response.json()
      assert.deepEqual(json, {
        query: { char: "漢" },
        results: {
          UCS: "U+6F22",
          unihan_rs: {
            kRSAdobe_Japan1_6: null,
            kRSUnicode: null,
          },
        },
      })
    }

    {
      const response = await app.request("http://example.test/api/v1/ivs-list?char=漢")
      assert.equal(response.status, 200)
      const json = await response.json()
      assert.deepEqual(json, {
        query: { char: "漢" },
        results: [
          {
            IVS: "漢󠄀",
            unicode: "6F22 E0100",
            collection: "ExampleCollection",
            code: "CID+1234",
          },
        ],
      })
    }

    {
      const response = await app.request("http://example.test/api/v1/idsfind?ids=%E2%BF%B0%E4%BA%BB%E8%A8%80")
      assert.equal(response.status, 200)
      const json = await response.json()
      assert.deepEqual(json, {
        query: {
          ids: ["⿰亻言"],
          whole: [],
        },
        results: ["信"],
        total: 1,
      })
    }

    assert.ok(mojidataDb.preparedSql.some((sql) => sql.includes("SELECT json_object('UCS'")))
    assert.ok(mojidataDb.preparedSql.some((sql) => sql.includes("SELECT json_object('char'")))
    assert.ok(mojidataDb.preparedSql.some((sql) => sql.includes("FROM ivs")))
    assert.ok(idsfindDb.preparedSql.some((sql) => sql.includes("from idsfind_fts")))
  })

  test("can be created from standard Cloudflare D1 binding names", async () => {
    const env: MojidataApiD1Env = {
      MOJIDATA_DB: createFakeMojidataDb(),
      IDSFIND_DB: createFakeIdsfindDb(),
    }
    const app = createD1AppFromEnv(env)

    const response = await app.request(
      "http://example.test/api/v1/mojidata?char=漢&select=UCS",
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      query: { char: "漢", select: ["UCS"] },
      results: { UCS: "U+6F22" },
    })
  })

  test("creates a reusable fetch handler for embedded Worker apps", async () => {
    const env: MojidataApiD1Env = {
      MOJIDATA_DB: createFakeMojidataDb(),
      IDSFIND_DB: createFakeIdsfindDb(),
    }
    const handleFetch = createD1FetchHandler()

    const response = await handleFetch(
      new Request("http://example.test/api/v1/ivs-list?char=漢"),
      env,
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      query: { char: "漢" },
      results: [
        {
          IVS: "漢󠄀",
          unicode: "6F22 E0100",
          collection: "ExampleCollection",
          code: "CID+1234",
        },
      ],
    })
  })
})
