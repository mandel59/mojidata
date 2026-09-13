import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  createBvecIdsfindCandidateProvider,
  createIdsfind,
} from "@mandel59/mojidata-api-core"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"

import { createBetterSqlite3ExecutorProvider } from "../index"

const queryCases = [
  ["⿰火土"],
  ["木"],
  ["⿰？心"],
  ["§⿱x⿰xx§"],
  ["？木"],
  ["⿰火"],
]

describe("idsfind Bloom-vector compatibility", () => {
  test("returns the same exact results as FTS5", async () => {
    const ftsProvider = createBetterSqlite3ExecutorProvider(
      require.resolve("@mandel59/idsdb-fts5/idsfind.db"),
    )
    const bvecProvider = createBetterSqlite3ExecutorProvider(
      require.resolve("@mandel59/idsdb-bvec/idsfind.db"),
    )
    const ftsIdsfind = createIdsfind(ftsProvider)
    const candidateProvider = createBvecIdsfindCandidateProvider()
    const bvecIdsfind = createIdsfind(bvecProvider, candidateProvider)
    const structuralCandidates = await candidateProvider.getCandidates(
      await bvecProvider(),
      tokenizeIdsList(["§⿱x⿰xx§"]).forQuery,
    )
    assert.ok(structuralCandidates.length < 10_000)

    for (const query of queryCases) {
      const [expected, actual] = await Promise.all([
        ftsIdsfind(query),
        bvecIdsfind(query),
      ])
      assert.deepEqual(actual.toSorted(), expected.toSorted(), query.join(" "))
    }
  })
})
