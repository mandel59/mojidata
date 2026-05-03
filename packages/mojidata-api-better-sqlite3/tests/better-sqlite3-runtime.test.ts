import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { createBetterSqlite3Db } from "../index"

describe("createBetterSqlite3Db", () => {
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
