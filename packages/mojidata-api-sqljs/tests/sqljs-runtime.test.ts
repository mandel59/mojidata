import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { createSqlJsDb } from "../index"

describe("createSqlJsDb", () => {
  test("supports sql.js as an explicit backend package", async () => {
    const db = createSqlJsDb()

    const mojidata = await db.getMojidataJson("漢", ["UCS"])
    const idsfind = await db.idsfind(["⿰亻言"])

    assert.equal(typeof mojidata, "string")
    assert.match(mojidata ?? "", /"UCS":"U\+6F22"/)
    assert.ok(idsfind.includes("信"))
  })
})
