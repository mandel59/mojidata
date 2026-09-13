import { spawnSync } from "node:child_process"
import Database from "better-sqlite3"
import { createBetterSqlite3Executor } from "@mandel59/mojidata-api-better-sqlite3"
import { createIdsfind } from "@mandel59/mojidata-api-core/lib/idsfind-sql"

type PatternNode = { token: string; children: PatternNode[] }
type WireNode = { token: string; arity: number }
type DictionaryEntry = { token: string; alternatives: PatternNode[] }
type TestCase = {
  name: string
  pattern: PatternNode
  dictionary: DictionaryEntry[]
  targets: PatternNode[]
}
type OracleResponse = {
  version: number
  command?: string
  matched?: boolean
  error?: string
}

const leaf = (token: string): PatternNode => ({ token, children: [] })
const node = (token: string, ...children: PatternNode[]): PatternNode => ({
  token,
  children,
})
const sun = leaf("日"), moon = leaf("月"), fire = leaf("火"), earth = leaf("土")
const person = leaf("亻"), tree = leaf("木"), wildcard = leaf("？")
const bright = leaf("明"), rest = leaf("休")
const brightAlternatives = [node("⿰", sun, moon), node("⿱", sun, moon)]
const restAlternatives = [node("⿰", person, tree), node("⿱", person, tree)]
const brightDict: DictionaryEntry = {
  token: "明",
  alternatives: brightAlternatives,
}
const restDict: DictionaryEntry = {
  token: "休",
  alternatives: restAlternatives,
}

const cases: TestCase[] = [
  { name: "missing-literal-positive", pattern: bright, dictionary: [], targets: [bright] },
  { name: "missing-literal-negative", pattern: bright, dictionary: [], targets: [moon] },
  { name: "first-definition-positive", pattern: bright, dictionary: [brightDict], targets: [brightAlternatives[0]] },
  { name: "second-definition-positive", pattern: bright, dictionary: [brightDict], targets: [brightAlternatives[1]] },
  { name: "definition-negative", pattern: bright, dictionary: [brightDict], targets: [node("⿰", moon, sun)] },
  {
    name: "two-token-cross-product-positive",
    pattern: node("⿰", bright, rest),
    dictionary: [brightDict, restDict],
    targets: [node("⿰", brightAlternatives[0], restAlternatives[1])],
  },
  {
    name: "same-token-independent-positive",
    pattern: node("⿰", bright, bright),
    dictionary: [brightDict],
    targets: [node("⿰", brightAlternatives[0], brightAlternatives[1])],
  },
  {
    name: "nested-query-positive",
    pattern: node("⿱", fire, node("⿰", bright, rest)),
    dictionary: [brightDict, restDict],
    targets: [node("⿱", fire, node("⿰", brightAlternatives[1], restAlternatives[0]))],
  },
  {
    name: "wildcard-subtree-positive",
    pattern: node("⿰", wildcard, bright),
    dictionary: [brightDict],
    targets: [node("⿰", node("⿱", fire, earth), brightAlternatives[0])],
  },
  {
    name: "wildcard-operator-mismatch",
    pattern: node("⿰", wildcard, bright),
    dictionary: [brightDict],
    targets: [node("⿱", fire, brightAlternatives[0])],
  },
  {
    name: "duplicate-definition-positive",
    pattern: bright,
    dictionary: [{
      token: "明",
      alternatives: [brightAlternatives[0], brightAlternatives[0]],
    }],
    targets: [brightAlternatives[0]],
  },
  {
    name: "replacement-not-recursive-positive",
    pattern: leaf("X"),
    dictionary: [{ token: "X", alternatives: [node("⿰", bright, fire)] }, brightDict],
    targets: [node("⿰", bright, fire)],
  },
  {
    name: "replacement-not-recursive-negative",
    pattern: leaf("X"),
    dictionary: [{ token: "X", alternatives: [node("⿰", bright, fire)] }, brightDict],
    targets: [node("⿰", brightAlternatives[0], fire)],
  },
  {
    name: "any-target-row-may-match",
    pattern: bright,
    dictionary: [brightDict],
    targets: [node("⿰", fire, earth), brightAlternatives[1]],
  },
  {
    name: "candidate-without-ids-row",
    pattern: bright,
    dictionary: [brightDict],
    targets: [],
  },
]

function wire(value: PatternNode): WireNode[] {
  return [{ token: value.token, arity: value.children.length }, ...value.children.flatMap(wire)]
}
function tokens(value: PatternNode): string[] {
  return [value.token, ...value.children.flatMap(tokens)]
}
function depth(value: PatternNode): number {
  return value.children.length === 0 ? 0 : 1 + Math.max(...value.children.map(depth))
}

async function actualMatch(testCase: TestCase): Promise<boolean> {
  const db = new Database(":memory:")
  try {
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        query_plan_json TEXT NOT NULL
      );
      INSERT INTO idsfind_semantics VALUES (
        1,
        '{"version":1,"transforms":[
          {"op":"expand-overlaid","version":1},
          {"op":"resolve-materialized-components","version":1}
        ]}'
      );
    `)
    const insert = db.prepare("INSERT INTO idsfind (UCS, IDS_tokens) VALUES (?, ?)")
    for (const entry of testCase.dictionary) {
      for (const alternative of entry.alternatives) {
        insert.run(entry.token, tokens(alternative).join(" "))
      }
    }
    for (const target of testCase.targets) {
      insert.run("TARGET", tokens(target).join(" "))
    }
    const executor = createBetterSqlite3Executor(db)
    const idsfind = createIdsfind(async () => executor, {
      async getCandidates(_db, _idslist, _sourceIdslist, policy) {
        if (!policy?.resolveMaterializedComponents) {
          throw new Error("resolution policy was not enabled")
        }
        return ["TARGET"]
      },
    })
    const query = `§${tokens(testCase.pattern).join("")}§`
    return (await idsfind([query])).includes("TARGET")
  } finally {
    db.close()
  }
}

const oraclePath = process.argv[2] ?? process.env.LEAN_IDSFLOW_ORACLE
if (!oraclePath) {
  throw new Error("Usage: differential-idsflow-exact-audit <path-to-ids_search_verify>")
}
const input = cases.map(testCase => JSON.stringify({
  version: 1,
  command: "resolve-pattern-matches",
  nodes: wire(testCase.pattern),
  dictionary: testCase.dictionary.map(entry => ({
    token: entry.token,
    alternatives: entry.alternatives.map(wire),
  })),
  targets: testCase.targets.map(wire),
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
  throw new Error(`Expected ${cases.length} responses, got ${responses.length}`)
}

async function main() {
  const mismatches: unknown[] = []
  let positiveCases = 0, negativeCases = 0
  for (const [index, testCase] of cases.entries()) {
    const expected = responses[index]
    if (expected.error || typeof expected.matched !== "boolean") {
      mismatches.push({ name: testCase.name, oracleResponse: expected })
      continue
    }
    const actual = await actualMatch(testCase)
    expected.matched ? positiveCases++ : negativeCases++
    if (expected.matched !== actual) {
      mismatches.push({
        name: testCase.name,
        expected: expected.matched,
        actual,
        source: tokens(testCase.pattern),
        targets: testCase.targets.map(tokens),
      })
    }
  }
  const summary = {
    protocolVersion: 1,
    cases: cases.length,
    positiveCases,
    negativeCases,
    maxPatternDepth: Math.max(...cases.map(item => depth(item.pattern))),
    maxTargetRows: Math.max(...cases.map(item => item.targets.length)),
    mismatches: mismatches.length,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (mismatches.length > 0) {
    console.error(JSON.stringify(mismatches, null, 2))
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
