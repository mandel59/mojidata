import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { createNodeDb } from "../node"

describe("createNodeDb", () => {
  test("supports node:sqlite as a node backend", async () => {
    const db = createNodeDb({ backend: "node:sqlite" })

    const mojidata = await db.getMojidataJson("漢", ["UCS"])
    const idsfind = await db.idsfind(["⿰亻言"])

    assert.equal(typeof mojidata, "string")
    assert.match(mojidata ?? "", /"UCS":"U\+6F22"/)
    assert.ok(idsfind.includes("信"))
  })
})
