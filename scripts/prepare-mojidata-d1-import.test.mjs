import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  buildUnihanMaterializationStatementsFromRelations,
  buildUnihanVariantMaterializationStatementsFromRelations,
} from "./prepare-mojidata-d1-import.mjs"

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
