import assert from "node:assert/strict"
import { describe, test } from "node:test"
import Database from "better-sqlite3"
import { buildMojidataSelectQuery } from "@mandel59/mojidata-api-core/lib/mojidata-query"

import { runMojidataApiConformanceTests } from "../../mojidata-api/tests/api-conformance"
import { createBetterSqlite3App, createBetterSqlite3Db } from "../index"

describe("createBetterSqlite3Db", () => {
  test("includes KDPV comments in an unselected full response", async () => {
    const db = createBetterSqlite3Db()
    const result = JSON.parse((await db.getMojidataJson("充", [])) ?? "{}")
    assert.deepEqual(result.kdpv_comment, [
      { subject: "充", rel: "hydzd/variant", object: "𠑽", comment: "[充=⿱亠厶]" },
    ])
  })

  test("matches IVS endpoints and preserves distinct comments without duplicating self relations", () => {
    const db = new Database(":memory:")
    try {
      db.exec("CREATE TABLE kdpv (subject TEXT, rel TEXT, object TEXT, comment TEXT); CREATE INDEX kdpv_subject ON kdpv(subject); CREATE INDEX kdpv_object ON kdpv(object)")
      const insert = db.prepare("INSERT INTO kdpv VALUES (?, 'test/variant', ?, ?)")
      for (const row of [
        ["A", "B", "first"], ["A", "B", "second"], ["A", "B", "first"],
        ["A", "A", "self"], ["A󠄀", "B", "forward IVS"], ["C", "A󠄀", "reverse IVS"],
        ["A", "D", null], ["A", "E", ""], ["B", "Z", "unrelated"],
      ]) insert.run(...row)
      const query = buildMojidataSelectQuery(["kdpv_comment"])
      const result = JSON.parse((db.prepare(query).get({ ucs: "A" }) as { vs: string }).vs)
      assert.deepEqual(result.kdpv_comment, [
        { subject: "A", rel: "test/variant", object: "A", comment: "self" },
        { subject: "A", rel: "test/variant", object: "B", comment: "first" },
        { subject: "A", rel: "test/variant", object: "B", comment: "second" },
        { subject: "A󠄀", rel: "test/variant", object: "B", comment: "forward IVS" },
        { subject: "C", rel: "test/variant", object: "A󠄀", comment: "reverse IVS" },
      ])
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all({ ucs: "A" }) as { detail: string }[]
      assert.ok(plan.some(row => /SEARCH kdpv USING INDEX kdpv_subject/.test(row.detail)))
      assert.ok(plan.some(row => /SEARCH kdpv USING INDEX kdpv_object/.test(row.detail)))
      assert.ok(!plan.some(row => /SCAN kdpv\b/.test(row.detail)))
      assert.ok(!buildMojidataSelectQuery(["kdpv"]).includes("'kdpv_comment'"))
    } finally {
      db.close()
    }
  })

  test("includes shrink-map reference notes in an unselected full response", async () => {
    const db = createBetterSqlite3Db()
    const result = JSON.parse((await db.getMojidataJson("鐥", [])) ?? "{}")
    assert.equal(result.mji.find((row: any) => row.MJ文字図形名 === "MJ068046").mjsm_note, "国字:みずかね")
  })

  test("retrieves shrink-map notes by their unique MJ glyph index", () => {
    const db = new Database(require.resolve("@mandel59/mojidata/dist/moji.db"), { readonly: true })
    try {
      const query = buildMojidataSelectQuery(["mji"])
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all({ ucs: "邉" }) as { detail: string }[]
      const notePlan = plan.filter(row => row.detail.includes("mjsm_note"))
      assert.equal(notePlan.length, 1)
      assert.match(notePlan[0].detail, /SEARCH mjsm_note USING INDEX sqlite_autoindex_mjsm_note_1 \(MJ文字図形名=\?\)/)
      assert.ok(!buildMojidataSelectQuery(["char", "UCS"]).includes("mjsm_note"))
    } finally {
      db.close()
    }
  })

  test("supports better-sqlite3 as an explicit native backend", async () => {
    const db = createBetterSqlite3Db()

    const mojidata = await db.getMojidataJson("漢", ["UCS"])
    const idsfind = await db.idsfind(["⿰亻言"])

    assert.equal(typeof mojidata, "string")
    assert.match(mojidata ?? "", /"UCS":"U\+6F22"/)
    assert.ok(idsfind.includes("信"))
  })

  test("returns ids_similar entries for current IDS mirror and rotation operators", async () => {
    const db = createBetterSqlite3Db()

    const mirror = JSON.parse((await db.getMojidataJson("卍", ["ids_similar"])) ?? "{}")
    const rotation = JSON.parse((await db.getMojidataJson("了", ["ids_similar"])) ?? "{}")

    assert.deepEqual(mirror.ids_similar, [
      { UCS: "卐", IDS: "⿾卍", source: "GT" },
    ])
    assert.deepEqual(rotation.ids_similar, [
      { UCS: "𠄏", IDS: "⿿了", source: "GTP" },
    ])
  })
})

runMojidataApiConformanceTests("better-sqlite3 API conformance", () => createBetterSqlite3App())
