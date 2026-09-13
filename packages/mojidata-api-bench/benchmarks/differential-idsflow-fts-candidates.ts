import { spawnSync } from "node:child_process"
import Database from "better-sqlite3"
import { createBetterSqlite3Executor } from "@mandel59/mojidata-api-better-sqlite3"
import { ftsIdsfindCandidateProvider } from "@mandel59/mojidata-api-core/lib/idsfind-sql"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"

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
type FtsModule = "fts4" | "fts5"

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
    name: "wildcard-subtree-boundary-false-positive",
    pattern: node("⿰", wildcard, bright),
    dictionary: [brightDict],
    targets: [node("⿰", fire, node("⿰", earth, brightAlternatives[0]))],
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

async function isCandidate(testCase: TestCase, ftsModule: FtsModule): Promise<boolean> {
  const db = new Database(":memory:")
  try {
    const ftsDefinition = ftsModule === "fts4"
      ? `fts4 (IDS_tokens, content='', tokenize=unicode61 "tokenchars=§⿰⿱⿲⿳")`
      : `fts5 (IDS_tokens, content='', tokenize="unicode61 tokenchars '§⿰⿱⿲⿳'")`
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE VIRTUAL TABLE idsfind_fts USING ${ftsDefinition};
    `)
    const insertIds = db.prepare(
      "INSERT INTO idsfind (UCS, IDS_tokens) VALUES (?, ?)",
    )
    const insertFts = db.prepare(
      "INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (?, ?)",
    )
    const insertTree = (ucs: string, value: PatternNode) => {
      const treeTokens = tokens(value).join(" ")
      const inserted = insertIds.run(ucs, treeTokens)
      insertFts.run(inserted.lastInsertRowid, `§ ${treeTokens} §`)
    }
    for (const entry of testCase.dictionary) {
      for (const alternative of entry.alternatives) {
        insertTree(entry.token, alternative)
      }
    }
    for (const target of testCase.targets) insertTree("TARGET", target)

    const tokenized = tokenizeIdsList([
      `§${tokens(testCase.pattern).join("")}§`,
    ])
    const candidates = await ftsIdsfindCandidateProvider.getCandidates(
      createBetterSqlite3Executor(db),
      tokenized.forQuery,
      tokenized.forAudit,
      {
        resolveMaterializedComponents:
          tokenized.resolveMaterializedComponents,
      },
    )
    return candidates.includes("TARGET")
  } finally {
    db.close()
  }
}

const oraclePath = process.argv[2] ?? process.env.LEAN_IDSFLOW_ORACLE
if (!oraclePath) {
  throw new Error(
    "Usage: differential-idsflow-fts-candidates <path-to-ids_search_verify>",
  )
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
  const oracleErrors: unknown[] = []
  const falseNegatives: unknown[] = []
  const falsePositives: unknown[] = []
  const byModule: Record<FtsModule, {
    checks: number
    falseNegatives: number
    falsePositives: number
  }> = {
    fts4: { checks: 0, falseNegatives: 0, falsePositives: 0 },
    fts5: { checks: 0, falseNegatives: 0, falsePositives: 0 },
  }
  let positiveCases = 0, negativeCases = 0
  for (const [index, testCase] of cases.entries()) {
    const expected = responses[index]
    if (expected.error || typeof expected.matched !== "boolean") {
      oracleErrors.push({ name: testCase.name, oracleResponse: expected })
      continue
    }
    expected.matched ? positiveCases++ : negativeCases++
    for (const ftsModule of ["fts4", "fts5"] as const) {
      const actual = await isCandidate(testCase, ftsModule)
      byModule[ftsModule].checks++
      if (expected.matched && !actual) {
        byModule[ftsModule].falseNegatives++
        falseNegatives.push({
          name: testCase.name,
          ftsModule,
          source: tokens(testCase.pattern),
          targets: testCase.targets.map(tokens),
        })
      } else if (!expected.matched && actual) {
        byModule[ftsModule].falsePositives++
        falsePositives.push({ name: testCase.name, ftsModule })
      }
    }
  }
  const summary = {
    protocolVersion: 1,
    cases: cases.length,
    checks: Object.values(byModule).reduce((sum, item) => sum + item.checks, 0),
    positiveCases,
    negativeCases,
    maxPatternDepth: Math.max(...cases.map(item => depth(item.pattern))),
    maxTargetRows: Math.max(...cases.map(item => item.targets.length)),
    falseNegatives: falseNegatives.length,
    falsePositives: falsePositives.length,
    oracleErrors: oracleErrors.length,
    byModule,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (falsePositives.length > 0) {
    console.log(JSON.stringify({ falsePositives }, null, 2))
  }
  if (falseNegatives.length > 0 || oracleErrors.length > 0) {
    console.error(JSON.stringify({ falseNegatives, oracleErrors }, null, 2))
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
