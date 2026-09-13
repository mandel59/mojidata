import assert from "node:assert/strict"
import { describe, test } from "node:test"

import Database from "better-sqlite3"

import {
  encodeIdsBvec,
  idsBvecFeatureVersion,
  idsBvecRecordBytes,
} from "@mandel59/idsdb-utils"
import {
  createBvecIdsfindCandidateProvider,
  createCachedFtsIdsfindCandidateProvider,
  createIdsfind,
  ftsIdsfindCandidateProvider,
  type IdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"

import { createBetterSqlite3Executor } from "../index"

type IdsRow = readonly [ucs: string, tokens: string]
type QueryExpectation = {
  query: string[]
  answers: string[]
  candidates?: {
    fts5: string[]
    bvec: string[]
  }
}
type CharacterizationCase = {
  id: string
  description: string
  rows: IdsRow[]
  expectations: QueryExpectation[]
}

const cases: CharacterizationCase[] = [
  {
    id: "Q01",
    description: "atomic literal",
    rows: [["甲", "日"]],
    expectations: [{ query: ["日"], answers: ["甲"] }],
  },
  {
    id: "Q02",
    description: "decomposable query character",
    rows: [
      ["甲", "⿱ ⿰ 日 月 木"],
      ["乙", "⿰ 日 月"],
    ],
    expectations: [{ query: ["乙"], answers: ["乙", "甲"] }],
  },
  {
    id: "Q03",
    description: "incomplete prefix",
    rows: [["甲", "⿱ ⿰ 日 月 木"]],
    expectations: [{ query: ["⿱⿰日"], answers: ["甲"] }],
  },
  {
    id: "Q04",
    description: "arbitrary start offset",
    rows: [["甲", "⿱ ⿰ 日 月 木"]],
    expectations: [{ query: ["⿰日"], answers: ["甲"] }],
  },
  {
    id: "Q05",
    description: "wildcard consumes one complete subtree",
    rows: [["甲", "⿰ 日 ⿱ 月 木"]],
    expectations: [{ query: ["⿰日？"], answers: ["甲"] }],
  },
  {
    id: "Q06",
    description: "wildcard cannot consume a partial subtree",
    rows: [["甲", "⿰ 日 ⿱ 月 木"]],
    expectations: [{
      query: ["⿰日？木"],
      answers: [],
      candidates: { fts5: ["甲"], bvec: ["甲"] },
    }],
  },
  {
    id: "Q07",
    description: "repeated variable positive",
    rows: [["甲", "⿱ ⿰ 日 月 ⿰ 日 月"]],
    expectations: [{ query: ["⿱xx"], answers: ["甲"] }],
  },
  {
    id: "Q08",
    description: "repeated variable negative",
    rows: [["甲", "⿱ ⿰ 日 月 ⿰ 日 木"]],
    expectations: [{
      query: ["⿱xx"],
      answers: [],
      candidates: { fts5: ["甲"], bvec: ["甲"] },
    }],
  },
  {
    id: "Q09",
    description: "variable bindings are local to each pattern",
    rows: [["甲", "⿰ 日 日 ⿰ 月 月"]],
    expectations: [{ query: ["⿰x日", "⿰x月"], answers: ["甲"] }],
  },
  {
    id: "Q10",
    description: "multiplicity counts matching start offsets",
    rows: [["甲", "⿰ 日 日"]],
    expectations: [
      { query: ["日*2"], answers: ["甲"] },
      {
        query: ["日*3"],
        answers: [],
        candidates: { fts5: ["甲"], bvec: ["甲"] },
      },
    ],
  },
  {
    id: "Q11",
    description: "multiplicity includes overlapping starts",
    rows: [["甲", "日 日 日"]],
    expectations: [
      { query: ["日日*2"], answers: ["甲"] },
      {
        query: ["日日*3"],
        answers: [],
        candidates: { fts5: ["甲"], bvec: ["甲"] },
      },
    ],
  },
  {
    id: "Q12",
    description: "whole-tree anchors positive",
    rows: [["甲", "⿰ 日 月"]],
    expectations: [{ query: ["§⿰日月§"], answers: ["甲"] }],
  },
  {
    id: "Q13",
    description: "whole-tree anchors exclude a nested subtree",
    rows: [["甲", "⿱ ⿰ 日 月 木"]],
    expectations: [{ query: ["§⿰日月§"], answers: [] }],
  },
  {
    id: "Q14",
    description: "conjuncts must match the same IDS row",
    rows: [
      ["甲", "⿰ 日 月"],
      ["甲", "⿱ 木 火"],
    ],
    expectations: [{
      query: ["⿰日", "⿱木"],
      answers: [],
      candidates: { fts5: ["甲"], bvec: [] },
    }],
  },
  {
    id: "Q15",
    description: "same-row conjunction positive",
    rows: [["甲", "⿰ 日 月 ⿱ 木 火"]],
    expectations: [{ query: ["⿰日", "⿱木"], answers: ["甲"] }],
  },
  {
    id: "Q16",
    description: "overlaid operands are commutative",
    rows: [["甲", "&OL3; ？ 日 月"]],
    expectations: [
      { query: ["⿻日月"], answers: ["甲"] },
      { query: ["⿻月日"], answers: ["甲"] },
    ],
  },
  {
    id: "Q17",
    description: "decomposition alternatives do not mix IDS rows",
    rows: [
      ["甲", "⿰ 日 月"],
      ["甲", "⿱ 木 火"],
      ["乙", "⿰ 日 月"],
      ["丙", "⿱ 木 火"],
    ],
    expectations: [{
      query: ["乙", "丙"],
      answers: [],
      candidates: { fts5: ["甲"], bvec: [] },
    }],
  },
]

function sorted(values: Iterable<string>) {
  return [...values].sort()
}

function popcount32(value: number) {
  let x = value >>> 0
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

function createFixture(rows: IdsRow[]) {
  const db = new Database(":memory:")
  db.exec(`
    CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
    CREATE VIRTUAL TABLE idsfind_fts USING fts5 (
      IDS_tokens,
      content='',
      tokenize="unicode61 tokenchars '§⿰⿱⿲⿻&;'"
    );
    CREATE TABLE idsfind_bvec_meta (
      schema_version INTEGER PRIMARY KEY,
      feature_version TEXT NOT NULL,
      byte_order TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      record_bytes INTEGER NOT NULL,
      block_size INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      idsfind_digest TEXT NOT NULL
    );
    CREATE TABLE idsfind_bvec_block (
      block_id INTEGER PRIMARY KEY,
      first_rowid INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      union0 INTEGER NOT NULL,
      union1 INTEGER NOT NULL,
      union2 INTEGER NOT NULL,
      union3 INTEGER NOT NULL,
      max_weight INTEGER NOT NULL,
      vectors BLOB NOT NULL
    );
  `)

  const insertIds = db.prepare(`INSERT INTO idsfind VALUES (?, ?)`)
  for (const row of rows) insertIds.run(...row)

  const documents = new Map<string, { rowid: number; tokens: string[] }>()
  rows.forEach(([ucs, tokens], index) => {
    const document = documents.get(ucs)
    if (document) {
      document.tokens.push(tokens)
    } else {
      documents.set(ucs, { rowid: index + 1, tokens: [tokens] })
    }
  })
  const insertFts = db.prepare(
    `INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (?, ?)`,
  )
  for (const { rowid, tokens } of documents.values()) {
    insertFts.run(rowid, `§ ${tokens.join(" § ")} §`)
  }

  const vectors = rows.map(([, tokens]) => encodeIdsBvec(tokens.split(" ")))
  const packed = Buffer.alloc(vectors.length * idsBvecRecordBytes)
  const union = [0, 0, 0, 0]
  let maxWeight = 0
  vectors.forEach((vector, row) => {
    let vectorUnion = 0
    vector.forEach((word, column) => {
      packed.writeUInt32LE(
        word >>> 0,
        row * idsBvecRecordBytes + column * 4,
      )
      union[column] = (union[column] | word) >>> 0
      vectorUnion = (vectorUnion | word) >>> 0
    })
    maxWeight = Math.max(maxWeight, popcount32(vectorUnion))
  })
  db.prepare(`
    INSERT INTO idsfind_bvec_block
    VALUES (0, 1, ?, ?, ?, ?, ?, ?, ?)
  `).run(rows.length, ...union, maxWeight, packed)
  db.prepare(`
    INSERT INTO idsfind_bvec_meta
    VALUES (1, ?, 'little', 4, 16, ?, ?, 'fixture')
  `).run(idsBvecFeatureVersion, rows.length, rows.length)

  const executor = createBetterSqlite3Executor(db)
  const providers = {
    fts5: ftsIdsfindCandidateProvider,
    fts5Cached: createCachedFtsIdsfindCandidateProvider(),
    bvec: createBvecIdsfindCandidateProvider(),
  }
  return { db, executor, providers }
}

async function observe(
  fixture: ReturnType<typeof createFixture>,
  provider: IdsfindCandidateProvider,
  query: string[],
) {
  const candidates = await provider.getCandidates(
    fixture.executor,
    tokenizeIdsList(query).forQuery,
  )
  const idsfind = createIdsfind(async () => fixture.executor, provider)
  const answers = await idsfind(query)
  return {
    candidates: sorted(candidates),
    answers: sorted(answers),
  }
}

describe("idsfind characterization matrix", () => {
  for (const characterization of cases) {
    test(`${characterization.id}: ${characterization.description}`, async () => {
      const fixture = createFixture(characterization.rows)
      try {
        for (const expectation of characterization.expectations) {
          for (const indexName of ["fts5", "fts5Cached", "bvec"] as const) {
            const provider = fixture.providers[indexName]
            const observation = await observe(fixture, provider, expectation.query)
            const expectedCandidates =
              expectation.candidates?.[
                indexName === "fts5Cached" ? "fts5" : indexName
              ] ?? expectation.answers
            assert.deepEqual(
              observation.candidates,
              sorted(expectedCandidates),
              `${indexName} candidates for ${expectation.query.join(" AND ")}`,
            )
            assert.deepEqual(
              observation.answers,
              sorted(expectation.answers),
              `${indexName} exact answers for ${expectation.query.join(" AND ")}`,
            )
            assert.ok(
              observation.answers.every((answer) =>
                observation.candidates.includes(answer),
              ),
              `${indexName} violates Ans(Q) subseteq Cand(Q)`,
            )
          }
        }
      } finally {
        fixture.db.close()
      }
    })
  }

  test("Q18: every exact answer is in every candidate set", async () => {
    for (const characterization of cases) {
      const fixture = createFixture(characterization.rows)
      try {
        for (const expectation of characterization.expectations) {
          for (const provider of Object.values(fixture.providers)) {
            const observation = await observe(fixture, provider, expectation.query)
            assert.ok(
              observation.answers.every((answer) =>
                observation.candidates.includes(answer),
              ),
              `${characterization.id}: ${expectation.query.join(" AND ")}`,
            )
          }
        }
      } finally {
        fixture.db.close()
      }
    }
  })
})
