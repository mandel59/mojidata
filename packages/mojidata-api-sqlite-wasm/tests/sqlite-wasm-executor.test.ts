import assert from "node:assert/strict"
import { describe, test } from "node:test"

import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import {
  createSqliteWasmExecutor,
  createSqliteWasmDb,
  createSqliteWasmDbFromOpfsSAHPool,
  installMojidataSqliteWasmFunctions,
  isOpfsSAHPoolSupported,
  openOpfsSAHPoolDatabase,
  assertSqliteWasmIdsfindFts5Schema,
  SqliteWasmIdsfindSchemaError,
  tryEnsureOpfsSAHPoolDatabase,
  tryInstallOpfsSAHPool,
  type SqliteWasmIdsfindSchemaDatabase,
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

describe("createSqliteWasmDb", () => {
  test("returns ids_similar entries for current IDS mirror and rotation operators", async () => {
    const sqlite3 = await sqlite3InitModule()
    const mojidataDb = new sqlite3.oo1.DB(":memory:")
    const idsfindDb = new sqlite3.oo1.DB(":memory:")
    try {
      mojidataDb.exec("CREATE TABLE ids (UCS TEXT NOT NULL, source TEXT NOT NULL, IDS TEXT NOT NULL)")
      mojidataDb.exec("INSERT INTO ids (UCS, source, IDS) VALUES ('卐', 'GT', '⿾卍'), ('𠄏', 'GTP', '⿿了')")

      const db = createSqliteWasmDb({
        getMojidataDb: async () => createSqliteWasmExecutor(mojidataDb),
        getIdsfindDb: async () => createSqliteWasmExecutor(idsfindDb),
      })

      const mirror = JSON.parse((await db.getMojidataJson("卍", ["ids_similar"])) ?? "{}")
      const rotation = JSON.parse((await db.getMojidataJson("了", ["ids_similar"])) ?? "{}")

      assert.deepEqual(mirror.ids_similar, [
        { UCS: "卐", IDS: "⿾卍", source: "GT" },
      ])
      assert.deepEqual(rotation.ids_similar, [
        { UCS: "𠄏", IDS: "⿿了", source: "GTP" },
      ])
    } finally {
      mojidataDb.close()
      idsfindDb.close()
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
  test("does not materialize OPFS databases during DB initialization", async () => {
    const poolUtil = {
      getFileNames() {
        throw new Error("database should not be materialized during initialization")
      },
      OpfsSAHPoolDb: class {},
    } as unknown as SqliteWasmSAHPoolUtil

    await assert.doesNotReject(() =>
      createSqliteWasmDbFromOpfsSAHPool({
        poolUtil,
        mojidata: {
          name: "/mojidata/moji.db",
          assetUrl: "https://example.test/moji.db",
          assetVersion: "moji-db-v1",
        },
        idsfind: {
          name: "/mojidata/idsfind.db",
          assetUrl: "https://example.test/idsfind.db",
          assetVersion: "idsfind-db-v1",
        },
      }),
    )
  })

  test("configures OPFS databases to keep temporary storage in memory", () => {
    const execCalls: string[] = []
    const poolUtil = {
      OpfsSAHPoolDb: class {
        constructor(
          readonly filename: string,
          readonly flags?: string,
        ) {}

        exec(sql: string) {
          execCalls.push(sql)
        }
      },
    } as unknown as SqliteWasmSAHPoolUtil

    openOpfsSAHPoolDatabase(poolUtil, "/mojidata/moji.db")

    assert.deepEqual(execCalls, ["PRAGMA temp_store=memory"])
  })

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

describe("sqlite-wasm idsfind schema validation", () => {
  function schemaDb(sql: string | undefined): SqliteWasmIdsfindSchemaDatabase {
    return {
      selectObject() {
        return sql === undefined ? undefined : { sql }
      },
    } as SqliteWasmIdsfindSchemaDatabase
  }

  test("accepts an FTS5 idsfind virtual table", () => {
    assert.doesNotThrow(() =>
      assertSqliteWasmIdsfindFts5Schema(
        schemaDb('CREATE VIRTUAL TABLE "idsfind_fts" USING fts5 ("IDS_tokens")'),
      ),
    )
  })

  test("rejects an FTS4 idsfind virtual table with package guidance", () => {
    assert.throws(
      () =>
        assertSqliteWasmIdsfindFts5Schema(
          schemaDb('CREATE VIRTUAL TABLE "idsfind_fts" USING fts4 ("IDS_tokens")'),
        ),
      (error) =>
        error instanceof SqliteWasmIdsfindSchemaError &&
        error.message.includes("@mandel59/idsdb-fts5") &&
        error.message.includes("FTS4"),
    )
  })

  test("public OPFS subpath is importable", async () => {
    const opfs = await import("@mandel59/mojidata-api-sqlite-wasm/opfs-sahpool")
    assert.equal(typeof opfs.ensureOpfsSAHPoolDatabase, "function")
  })
})
