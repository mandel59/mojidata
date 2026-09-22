import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, test } from "node:test"

import {
  buildUnihanMaterializationStatements,
  buildUnihanMaterializationStatementsFromRelations,
  buildUnihanVariantMaterializationStatementsFromRelations,
  isIdsfindDbPath,
  parseArgs,
  writeDumpFile,
} from "./prepare-mojidata-d1-import.mjs"

const sqlite3Command = process.env.SQLITE3 ?? "sqlite3"

describe("literal D1 artifacts", () => {
  test("materializes source views locally and creates indexes before inserting any rows", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mojidata-d1-literal-"))
    const source = path.join(tempDir, "moji.db")
    const target = path.join(tempDir, "imported.db")
    const output = path.join(tempDir, "mojidata.sql")
    try {
      execFileSync(sqlite3Command, [source, `
        CREATE TABLE unihan_kJapaneseNewVariant (UCS TEXT PRIMARY KEY, value TEXT);
        INSERT INTO unihan_kJapaneseNewVariant VALUES ('瓣', 'U+5F01'), ('辨', 'U+5F01'), ('辯', 'U+5F01');
        CREATE INDEX new_value ON unihan_kJapaneseNewVariant(value);
        CREATE TABLE unihan_each_kJapaneseOldVariant (UCS TEXT, i INTEGER, value TEXT);
        INSERT INTO unihan_each_kJapaneseOldVariant VALUES ('弁',1,'U+74E3'),('弁',2,'U+8FA8'),('弁',3,'U+8FAF');
        CREATE VIEW unihan_kJapaneseOldVariant AS SELECT UCS,group_concat(value,' ') AS value FROM unihan_each_kJapaneseOldVariant GROUP BY UCS;
        CREATE VIEW unihan AS
          SELECT UCS,'kJapaneseNewVariant' AS property,value FROM unihan_kJapaneseNewVariant UNION ALL
          SELECT UCS,'kJapaneseOldVariant',value FROM unihan_kJapaneseOldVariant;
        CREATE VIEW unihan_variant AS
          SELECT UCS,'kJapaneseNewVariant' AS property,'弁' AS value,NULL AS additional_data FROM unihan_kJapaneseNewVariant UNION ALL
          SELECT '弁','kJapaneseOldVariant',UCS,NULL FROM unihan_kJapaneseNewVariant;
        CREATE TABLE text_values (value TEXT, nullable TEXT, bytes BLOB, calculated TEXT GENERATED ALWAYS AS (value || '!') VIRTUAL);
        INSERT INTO text_values VALUES ('literal SELECT; INSERT INTO ''quoted'' ' || char(10) || '𠮷', NULL, x'0001FF');
      `])
      const plan = writeDumpFile(source, output)
      assert.equal(plan.recipe, "literal-values-indexes-first-v1")
      assert.equal(plan.tables.find(row => row.table === "unihan_variant").rows, 6)
      const sql = fs.readFileSync(output, "utf8")
      assert.ok(sql.lastIndexOf("CREATE INDEX") < sql.indexOf("INSERT INTO"))
      assert.doesNotMatch(sql, /INSERT INTO[^;]*\bSELECT\b[^;]*\bFROM\b/)
      execFileSync(sqlite3Command, [target], { input: sql })
      const query = `SELECT UCS,property,value,additional_data FROM unihan_variant ORDER BY property,UCS,value;`
      assert.equal(execFileSync(sqlite3Command, [target, query], { encoding: "utf8" }),
        execFileSync(sqlite3Command, [source, query], { encoding: "utf8" }))
      const values = `SELECT hex(value),nullable IS NULL,hex(bytes),hex(calculated) FROM text_values;`
      assert.equal(execFileSync(sqlite3Command, [target, values], { encoding: "utf8" }),
        execFileSync(sqlite3Command, [source, values], { encoding: "utf8" }))
      assert.equal(execFileSync(sqlite3Command, [source, `SELECT type FROM sqlite_schema WHERE name='unihan_variant'`], { encoding: "utf8" }).trim(), "view")
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test("groups FTS tokens locally and preserves sparse source rowids", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mojidata-d1-fts-"))
    const source = path.join(tempDir, "idsfind.db")
    const target = path.join(tempDir, "imported.db")
    const output = path.join(tempDir, "idsdb-fts5.sql")
    try {
      execFileSync(sqlite3Command, [source, `
        CREATE TABLE idsfind (UCS TEXT, IDS_tokens TEXT);
        CREATE INDEX idsfind_UCS ON idsfind(UCS);
        INSERT INTO idsfind(rowid,UCS,IDS_tokens) VALUES (3,'信','亻 言'),(8,'信','人 言'),(12,'休','亻 木');
        CREATE VIRTUAL TABLE idsfind_fts USING fts5(content='', IDS_tokens);
      `])
      const plan = writeDumpFile(source, output)
      assert.equal(plan.dataRows, 5)
      const sql = fs.readFileSync(output, "utf8")
      assert.doesNotMatch(sql, /GROUP BY|INSERT INTO[^;]*SELECT/)
      assert.ok(sql.indexOf("CREATE INDEX") < sql.indexOf("INSERT INTO"))
      execFileSync(sqlite3Command, [target], { input: sql })
      assert.equal(execFileSync(sqlite3Command, [target,
        `SELECT DISTINCT UCS FROM idsfind WHERE rowid IN (SELECT rowid FROM idsfind_fts WHERE idsfind_fts MATCH '言');`,
      ], { encoding: "utf8" }).trim(), "信")
      assert.equal(execFileSync(sqlite3Command, [target, 'SELECT group_concat(rowid) FROM (SELECT rowid FROM idsfind ORDER BY rowid);'], { encoding: "utf8" }).trim(), "3,8,12")
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe("parseArgs", () => {
  test("accepts a pair of externally built database artifacts", () => {
    const args = parseArgs([
      "--output-dir",
      "d1-output",
      "--mojidata-db",
      "artifacts/moji.db",
      "--idsfind-db",
      "artifacts/idsfind.db",
    ])

    assert.equal(args.outputDir, path.resolve("d1-output"))
    assert.equal(args.mojidataDb, path.resolve("artifacts/moji.db"))
    assert.equal(args.idsfindDb, path.resolve("artifacts/idsfind.db"))
  })

  test("rejects an incomplete external artifact pair", () => {
    assert.throws(
      () => parseArgs(["--mojidata-db", "artifacts/moji.db"]),
      /must be provided together/,
    )
  })

  test("rejects an option without a value", () => {
    assert.throws(() => parseArgs(["--idsfind-db"]), /requires a value/)
  })
})

describe("isIdsfindDbPath", () => {
  test("matches packaged and release-artifact FTS5 database names", () => {
    assert.equal(isIdsfindDbPath("/tmp/mojidata/idsfind.db"), true)
    assert.equal(isIdsfindDbPath("C:\\tmp\\mojidata\\idsfind.db"), true)
    assert.equal(isIdsfindDbPath("C:\\tmp\\release\\idsfind-fts5.db"), true)
    assert.equal(isIdsfindDbPath("C:\\tmp\\mojidata\\moji.db"), false)
    assert.equal(isIdsfindDbPath("/tmp/mojidata/idsfind.db.bak"), false)
  })
})

describe("buildUnihanMaterializationStatementsFromRelations", () => {
  test("materializes every Unihan property source relation", () => {
    const sql = buildUnihanMaterializationStatementsFromRelations([
      "unihan_kJapanese",
      "unihan_kTraditionalVariant",
    ])

    assert.match(sql, /CREATE TABLE "unihan"/)
    assert.match(sql, /CREATE INDEX "unihan_property_value"/)
    assert.match(
      sql,
      /SELECT "UCS", 'kJapanese', "value" FROM "unihan_kJapanese"/,
    )
    assert.match(
      sql,
      /SELECT "UCS", 'kTraditionalVariant', "value" FROM "unihan_kTraditionalVariant"/,
    )
  })

  test("materializes view-backed Unihan property source relations", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mojidata-d1-import-test-"))
    const dbPath = path.join(tempDir, "moji.db")

    try {
      execFileSync(sqlite3Command, [
        dbPath,
        [
          `CREATE TABLE "unihan_kDefinition" ("UCS" TEXT NOT NULL, "value" TEXT NOT NULL);`,
          `CREATE TABLE "unihan_each_kTraditionalVariant" ("UCS" TEXT NOT NULL, "value" TEXT NOT NULL);`,
          `CREATE VIEW "unihan_kTraditionalVariant" AS SELECT "UCS", "value" FROM "unihan_each_kTraditionalVariant";`,
        ].join("\n"),
      ])

      const sql = buildUnihanMaterializationStatements(dbPath)

      assert.match(
        sql,
        /SELECT "UCS", 'kDefinition', "value" FROM "unihan_kDefinition"/,
      )
      assert.match(
        sql,
        /SELECT "UCS", 'kTraditionalVariant', "value" FROM "unihan_kTraditionalVariant"/,
      )
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe("buildUnihanVariantMaterializationStatementsFromRelations", () => {
  test("materializes Unihan variant relations from source relations", () => {
    const sql = buildUnihanVariantMaterializationStatementsFromRelations([
      "unihan_kTraditionalVariant",
    ])

    assert.match(sql, /CREATE TABLE "unihan_variant"/)
    assert.match(sql, /CREATE INDEX "unihan_variant_UCS"/)
    assert.match(
      sql,
      /INSERT INTO "unihan_variant" \("UCS", "property", "value", "additional_data"\)/,
    )
    assert.match(sql, /'kTraditionalVariant' AS "property"/)
    assert.match(sql, /FROM \(SELECT UCS, value FROM "unihan_kTraditionalVariant"\) AS k/)
  })

  test("decodes Unihan variant codepoints as Unicode characters", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mojidata-d1-import-test-"))
    const dbPath = path.join(tempDir, "moji.db")

    try {
      execFileSync(sqlite3Command, [
        dbPath,
        [
          `CREATE TABLE "unihan_kTraditionalVariant" ("UCS" TEXT NOT NULL, "value" TEXT NOT NULL);`,
          `INSERT INTO "unihan_kTraditionalVariant" ("UCS", "value") VALUES ('线', 'U+7DDA');`,
          buildUnihanVariantMaterializationStatementsFromRelations([
            "unihan_kTraditionalVariant",
          ]),
        ].join("\n"),
      ])

      const valueHex = execFileSync(
        sqlite3Command,
        [
          dbPath,
          `SELECT hex(value) FROM "unihan_variant" WHERE "UCS" = '线' AND "property" = 'kTraditionalVariant';`,
        ],
        { encoding: "utf8" },
      ).trim()

      assert.equal(valueHex, "E7B79A")
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test("does not create an empty unihan_variant table without variant sources", () => {
    const sql = buildUnihanVariantMaterializationStatementsFromRelations([
      "unihan_kDefinition",
    ])

    assert.equal(sql, "")
  })

  test("materializes Japanese new forms and multiple view-backed old forms", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mojidata-d1-import-test-"))
    const dbPath = path.join(tempDir, "moji.db")
    try {
      execFileSync(sqlite3Command, [dbPath, [
        `CREATE TABLE unihan_kJapaneseNewVariant (UCS TEXT, value TEXT);`,
        `INSERT INTO unihan_kJapaneseNewVariant VALUES ('瓣', 'U+5F01'), ('辨', 'U+5F01'), ('辯', 'U+5F01');`,
        `CREATE TABLE unihan_each_kJapaneseOldVariant (UCS TEXT, i INTEGER, value TEXT);`,
        `INSERT INTO unihan_each_kJapaneseOldVariant VALUES ('弁', 1, 'U+74E3'), ('弁', 2, 'U+8FA8'), ('弁', 3, 'U+8FAF');`,
        `CREATE VIEW unihan_kJapaneseOldVariant AS SELECT UCS, group_concat(value, ' ') AS value FROM unihan_each_kJapaneseOldVariant GROUP BY UCS;`,
        buildUnihanVariantMaterializationStatementsFromRelations([
          "unihan_kJapaneseNewVariant", "unihan_kJapaneseOldVariant",
        ]),
      ].join("\n")])
      const rows = JSON.parse(execFileSync(sqlite3Command, ["-json", dbPath,
        `SELECT UCS, property, value, additional_data FROM unihan_variant ORDER BY property, UCS, value;`,
      ], { encoding: "utf8" }))
      assert.deepEqual(rows, [
        ...["瓣", "辨", "辯"].map(UCS => ({ UCS, property: "kJapaneseNewVariant", value: "弁", additional_data: null })),
        ...["瓣", "辨", "辯"].map(value => ({ UCS: "弁", property: "kJapaneseOldVariant", value, additional_data: null })),
      ])
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
