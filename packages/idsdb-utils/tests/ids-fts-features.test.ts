import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  collectIdsFtsFeatures,
  encodeIdsFtsEdgeFeature,
  encodeIdsFtsRootFeature,
} from "../index"

describe("IDS FTS structural features", () => {
  test("extracts root and positioned local edges", () => {
    assert.deepEqual(
      new Set(collectIdsFtsFeatures(
        ["⿱", "木", "⿰", "日", "月"],
        { families: ["root", "edge"] },
      )),
      new Set([
        encodeIdsFtsRootFeature("⿱"),
        encodeIdsFtsEdgeFeature("⿱", 0, "木"),
        encodeIdsFtsEdgeFeature("⿱", 1, "⿰"),
        encodeIdsFtsEdgeFeature("⿰", 0, "日"),
        encodeIdsFtsEdgeFeature("⿰", 1, "月"),
      ]),
    )
  })

  test("keeps known edges in an incomplete prefix", () => {
    assert.deepEqual(
      collectIdsFtsFeatures(
        ["⿱", "木"],
        { families: ["edge"] },
      ),
      [encodeIdsFtsEdgeFeature("⿱", 0, "木")],
    )
  })

  test("can omit unstable literal labels while retaining IDC edges", () => {
    const features = collectIdsFtsFeatures(
      ["⿱", "木", "⿰", "日", "月"],
      {
        families: ["root", "edge"],
        includeToken: token => token in { "⿱": true, "⿰": true },
      },
    )
    assert.deepEqual(features, [
      encodeIdsFtsRootFeature("⿱"),
      encodeIdsFtsEdgeFeature("⿱", 1, "⿰"),
    ])
  })
})
