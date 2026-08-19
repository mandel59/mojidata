import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  canonicalizeIdsTreePaths,
  collectIdsFtsFeatures,
  encodeIdsFtsEdgeFeature,
  encodeIdsFtsEqualityFeature,
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

  test("canonicalizes equality paths in distinct preorder", () => {
    assert.deepEqual(
      canonicalizeIdsTreePaths([
        [1], [0, 1], [], [0], [1], [0, 0], [0],
      ]),
      [[], [0], [0, 0], [0, 1], [1]],
    )
  })

  test("extracts collision-free equal-subtree path pairs", () => {
    assert.deepEqual(
      new Set(collectIdsFtsFeatures(
        ["⿱", "木", "⿰", "木", "木"],
        { families: ["equality"] },
      )),
      new Set([
        encodeIdsFtsEqualityFeature([0], [1, 0]),
        encodeIdsFtsEqualityFeature([0], [1, 1]),
        encodeIdsFtsEqualityFeature([1, 0], [1, 1]),
      ]),
    )
  })

  test("does not emit equality for incomplete subtrees", () => {
    assert.deepEqual(
      collectIdsFtsFeatures(
        ["⿱", "⿰"],
        { families: ["equality"] },
      ),
      [],
    )
  })
})
