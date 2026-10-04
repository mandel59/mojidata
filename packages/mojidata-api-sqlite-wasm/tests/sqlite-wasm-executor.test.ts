import assert from "node:assert/strict"
import { describe, test } from "node:test"

import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import appModule from "../../mojidata-api-hono/lib/app.ts"
import conformanceModule from "../../mojidata-api/tests/api-conformance.ts"
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

const { createApp } = appModule as typeof import("../../mojidata-api-hono/lib/app")
const { runMojidataApiConformanceTests } =
  conformanceModule as typeof import("../../mojidata-api/tests/api-conformance")

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

runMojidataApiConformanceTests("sqlite-wasm API conformance", async () => {
  const sqlite3 = await sqlite3InitModule()
  const mojidataDb = new sqlite3.oo1.DB(":memory:")
  const idsfindDb = new sqlite3.oo1.DB(":memory:")

  mojidataDb.exec("CREATE TABLE ids (UCS TEXT NOT NULL, source TEXT NOT NULL, IDS TEXT NOT NULL)")
  mojidataDb.exec("INSERT INTO ids (UCS, source, IDS) VALUES ('卐', 'GT', '⿾卍'), ('𠄏', 'GTP', '⿿了')")
  mojidataDb.exec("CREATE TABLE ivs (IVS TEXT NOT NULL, collection TEXT NOT NULL, code TEXT NOT NULL)")
  mojidataDb.exec("INSERT INTO ivs (IVS, collection, code) VALUES ('一󠄀', 'ExampleCollection', 'CID+1200')")

  mojidataDb.exec(`
    CREATE TABLE mji (
      MJ文字図形名 TEXT PRIMARY KEY, 対応するUCS TEXT, 実装したUCS TEXT,
      実装したMoji_JohoコレクションIVS TEXT, 実装したSVS TEXT,
      戸籍統一文字番号 TEXT, 住基ネット統一文字コード TEXT,
      入管正字コード TEXT, 入管外字コード TEXT, 漢字施策 TEXT,
      対応する互換漢字 TEXT, X0213 TEXT, X0213_包摂連番 TEXT,
      X0213_包摂区分 INTEGER, X0212 TEXT, MJ文字図形バージョン TEXT,
      登記統一文字番号 TEXT, 総画数 INTEGER, 大漢和 INTEGER,
      日本語漢字辞典 INTEGER, 新大字典 INTEGER, 大字源 INTEGER,
      大漢語林 INTEGER, 備考 TEXT
    );
    CREATE INDEX mji_対応するUCS ON mji (対応するUCS);
    CREATE INDEX mji_実装したUCS ON mji (実装したUCS);
    CREATE TABLE mji_rsindex (MJ文字図形名 TEXT, 部首 INTEGER, 内画数 INTEGER);
    CREATE TABLE radicals (部首 INTEGER, 部首漢字 TEXT);
    CREATE TABLE mji_reading (MJ文字図形名 TEXT, 読み TEXT);
    CREATE TABLE mji_changelog (MJ文字図形名 TEXT, 更新履歴 TEXT);
    CREATE TABLE mjsm (
      MJ文字図形名 TEXT, 縮退UCS TEXT, 表 TEXT, 順位 INTEGER, ホップ数 INTEGER
    );
    CREATE TABLE mjsm_note (MJ文字図形名 TEXT PRIMARY KEY, 参考情報 TEXT);
    INSERT INTO mji (MJ文字図形名, 対応するUCS, 実装したUCS) VALUES
      ('MJ068046', '鐥', '鐥'), ('MJ006294', '一', '一'),
      ('MJ058866', '邉', '邉'), ('MJ026190', '邉', '邉');
    INSERT INTO mjsm_note (MJ文字図形名, 参考情報) VALUES
      ('MJ068046', '国字:みずかね'), ('MJ058866', '地名外字');

    CREATE TABLE kdpv (subject TEXT, rel TEXT, object TEXT, comment TEXT);
    CREATE INDEX kdpv_subject ON kdpv (subject);
    CREATE INDEX kdpv_object ON kdpv (object);
    CREATE TABLE kdpv_rels (rel TEXT PRIMARY KEY, rev TEXT);
    INSERT INTO kdpv VALUES ('充', 'hydzd/variant', '𠑽', '[充=⿱亠厶]');
    INSERT INTO kdpv_rels VALUES ('hydzd/variant', 'hydzd/proper');
  `)

  idsfindDb.exec("CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)")
  idsfindDb.exec("CREATE VIRTUAL TABLE idsfind_fts USING fts5(IDS_tokens)")
  idsfindDb.exec("INSERT INTO idsfind (rowid, UCS, IDS_tokens) VALUES (1, '信', '⿰ 亻 言')")
  idsfindDb.exec("INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (1, '⿰ 亻 言')")

  return createApp(createSqliteWasmDb({
    getMojidataDb: async () => createSqliteWasmExecutor(mojidataDb),
    getIdsfindDb: async () => createSqliteWasmExecutor(idsfindDb),
  }))
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
