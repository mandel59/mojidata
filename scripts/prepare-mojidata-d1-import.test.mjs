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
} from "./prepare-mojidata-d1-import.mjs"

const sqlite3Command = process.env.SQLITE3 ?? "sqlite3"

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

  test("does not create an empty unihan_variant table without variant sources", () => {
    const sql = buildUnihanVariantMaterializationStatementsFromRelations([
      "unihan_kDefinition",
    ])

    assert.equal(sql, "")
  })
})
