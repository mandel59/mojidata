import { spawnSync } from "node:child_process"

import Database from "better-sqlite3"

import { idsfindPatternQueryContext } from "@mandel59/mojidata-api-core/lib/idsfind-query"

type PatternNode = {
  token: string
  children: PatternNode[]
}

type WireNode = {
  token: string
  arity: number
}

type DictionaryEntry = {
  token: string
  alternatives: PatternNode[]
}

type TestCase = {
  name: string
  pattern: PatternNode
  dictionary: DictionaryEntry[]
}

type OracleResponse = {
  version: number
  command?: string
  alternatives?: WireNode[][]
  error?: string
}

const leaf = (token: string): PatternNode => ({ token, children: [] })
const node = (token: string, ...children: PatternNode[]): PatternNode => ({
  token,
  children,
})

const sun = leaf("日")
const moon = leaf("月")
const fire = leaf("火")
const person = leaf("亻")
const mouth = leaf("口")
const wildcard = leaf("？")
const bright = leaf("明")
const rest = leaf("休")

const brightAlternatives = [
  node("⿰", sun, moon),
  node("⿱", sun, moon),
]
const restAlternatives = [
  node("⿰", person, leaf("木")),
  node("⿱", person, leaf("木")),
]

const cases: TestCase[] = [
  {
    name: "missing-definition-falls-back-to-literal",
    pattern: bright,
    dictionary: [],
  },
  {
    name: "one-definition",
    pattern: bright,
    dictionary: [{ token: "明", alternatives: [brightAlternatives[0]] }],
  },
  {
    name: "multiple-definitions",
    pattern: bright,
    dictionary: [{ token: "明", alternatives: brightAlternatives }],
  },
  {
    name: "resolve-one-child",
    pattern: node("⿰", bright, fire),
    dictionary: [{ token: "明", alternatives: brightAlternatives }],
  },
  {
    name: "cross-product-two-children",
    pattern: node("⿰", bright, rest),
    dictionary: [
      { token: "明", alternatives: brightAlternatives },
      { token: "休", alternatives: restAlternatives },
    ],
  },
  {
    name: "same-token-independent-occurrences",
    pattern: node("⿰", bright, bright),
    dictionary: [{ token: "明", alternatives: brightAlternatives }],
  },
  {
    name: "ternary-query-cross-product",
    pattern: node("⿲", bright, sun, rest),
    dictionary: [
      { token: "明", alternatives: brightAlternatives },
      { token: "休", alternatives: restAlternatives },
    ],
  },
  {
    name: "nested-query-cross-product",
    pattern: node("⿱", fire, node("⿰", bright, rest)),
    dictionary: [
      { token: "明", alternatives: brightAlternatives },
      { token: "休", alternatives: restAlternatives },
    ],
  },
  {
    name: "wildcard-is-not-resolved",
    pattern: node("⿰", wildcard, bright),
    dictionary: [{ token: "明", alternatives: brightAlternatives }],
  },
  {
    name: "ternary-definition",
    pattern: leaf("品"),
    dictionary: [{
      token: "品",
      alternatives: [node("⿲", mouth, mouth, mouth)],
    }],
  },
  {
    name: "mixed-missing-and-defined",
    pattern: node("⿱", leaf("未"), bright),
    dictionary: [{ token: "明", alternatives: brightAlternatives }],
  },
  {
    name: "duplicate-definition-rows",
    pattern: bright,
    dictionary: [{
      token: "明",
      alternatives: [brightAlternatives[0], brightAlternatives[0]],
    }],
  },
  {
    name: "replacement-is-not-resolved-recursively",
    pattern: leaf("X"),
    dictionary: [
      { token: "X", alternatives: [node("⿰", bright, fire)] },
      { token: "明", alternatives: brightAlternatives },
    ],
  },
]

function wireNodes(pattern: PatternNode): WireNode[] {
  return [
    { token: pattern.token, arity: pattern.children.length },
    ...pattern.children.flatMap(wireNodes),
  ]
}

function tokens(pattern: PatternNode): string[] {
  return [pattern.token, ...pattern.children.flatMap(tokens)]
}

function depth(pattern: PatternNode): number {
  return pattern.children.length === 0
    ? 0
    : 1 + Math.max(...pattern.children.map(depth))
}

function canonicalAlternatives(alternatives: string[][]): string[] {
  return alternatives.map(alternative => JSON.stringify(alternative)).sort()
}

function uniqueAlternatives(alternatives: string[][]): string[] {
  return [...new Set(canonicalAlternatives(alternatives))]
}

const resolvedPatternsQuery = `${idsfindPatternQueryContext}
select combinations.tokens as tokens
from combinations
where level = (
  select max(decomposed.key)
  from decomposed
  where decomposed.key0 = combinations.key0
    and decomposed.key1 = combinations.key1
)
`

function sqliteAlternatives(testCase: TestCase): string[][] {
  const db = new Database(":memory:")
  try {
    db.exec("CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)")
    const insert = db.prepare(
      "INSERT INTO idsfind (UCS, IDS_tokens) VALUES (?, ?)",
    )
    for (const entry of testCase.dictionary) {
      for (const alternative of entry.alternatives) {
        insert.run(entry.token, tokens(alternative).join(" "))
      }
    }
    const rows = db.prepare(resolvedPatternsQuery).all({
      idslist: JSON.stringify([[tokens(testCase.pattern)]]),
      resolve_materialized_components: 1,
    }) as { tokens: string }[]
    return rows.map(row => row.tokens.split(" "))
  } finally {
    db.close()
  }
}

const oraclePath = process.argv[2] ?? process.env.LEAN_IDSFLOW_ORACLE
if (!oraclePath) {
  throw new Error(
    "Usage: differential-idsflow-resolution <path-to-ids_search_verify>",
  )
}

const input = cases.map(testCase => JSON.stringify({
  version: 1,
  command: "resolve-pattern-alternatives",
  nodes: wireNodes(testCase.pattern),
  dictionary: testCase.dictionary.map(entry => ({
    token: entry.token,
    alternatives: entry.alternatives.map(wireNodes),
  })),
})).join("\n") + "\n"

const oracle = spawnSync(oraclePath, ["--jsonl"], {
  input,
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
})
if (oracle.error) throw oracle.error
if (oracle.status !== 0) {
  throw new Error("Lean oracle failed (" + oracle.status + "): " + oracle.stderr)
}

const responses = oracle.stdout.trim().split(/\r?\n/u)
  .map(line => JSON.parse(line) as OracleResponse)
if (responses.length !== cases.length) {
  throw new Error(
    `Expected ${cases.length} oracle responses, got ${responses.length}`,
  )
}

const semanticMismatches: unknown[] = []
const multiplicityMismatches: unknown[] = []
let leanAlternatives = 0
let sqliteRows = 0

cases.forEach((testCase, index) => {
  const response = responses[index]
  if (response.error || !response.alternatives) {
    semanticMismatches.push({ name: testCase.name, oracleResponse: response })
    return
  }
  const expected = response.alternatives.map(alternative =>
    alternative.map(item => item.token)
  )
  const actual = sqliteAlternatives(testCase)
  leanAlternatives += expected.length
  sqliteRows += actual.length

  if (
    JSON.stringify(uniqueAlternatives(expected)) !==
      JSON.stringify(uniqueAlternatives(actual))
  ) {
    semanticMismatches.push({
      name: testCase.name,
      source: tokens(testCase.pattern),
      expected,
      actual,
    })
  }
  if (
    JSON.stringify(canonicalAlternatives(expected)) !==
      JSON.stringify(canonicalAlternatives(actual))
  ) {
    multiplicityMismatches.push({
      name: testCase.name,
      expected,
      actual,
    })
  }
})

const summary = {
  protocolVersion: 1,
  cases: cases.length,
  maxPatternDepth: Math.max(...cases.map(item => depth(item.pattern))),
  maxDefinitionsPerToken: Math.max(
    ...cases.flatMap(item =>
      item.dictionary.map(entry => entry.alternatives.length)
    ),
  ),
  leanAlternatives,
  sqliteRows,
  semanticMismatches: semanticMismatches.length,
  multiplicityMismatches: multiplicityMismatches.length,
}
console.log(JSON.stringify(summary, null, 2))
if (semanticMismatches.length > 0 || multiplicityMismatches.length > 0) {
  console.error(JSON.stringify({
    semanticMismatches,
    multiplicityMismatches,
  }, null, 2))
  process.exitCode = 1
}
