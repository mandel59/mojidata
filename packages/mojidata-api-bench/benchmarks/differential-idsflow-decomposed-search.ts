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
type FtsModule = "fts4" | "fts5"

const leaf = (token: string): PatternNode => ({ token, children: [] })
const node = (token: string, ...children: PatternNode[]): PatternNode => ({
  token,
  children,
})
const overlaid = (left: PatternNode, right: PatternNode): PatternNode =>
  node("&OL3;", leaf("&H;"), left, right)

const sun = leaf("日"), moon = leaf("月"), fire = leaf("火"), earth = leaf("土")
const bright = leaf("明"), wildcard = leaf("？")
const brightHorizontal = node("⿰", sun, moon)
const brightVertical = node("⿱", sun, moon)
const brightDict: DictionaryEntry = {
  token: "明",
  alternatives: [brightHorizontal, brightVertical],
}

const cases: TestCase[] = [
  {
    name: "root-overlay-forward",
    pattern: node("⿻", sun, moon),
    dictionary: [],
    targets: [overlaid(sun, moon)],
  },
  {
    name: "root-overlay-reverse",
    pattern: node("⿻", sun, moon),
    dictionary: [],
    targets: [overlaid(moon, sun)],
  },
  {
    name: "raw-overlay-target-negative",
    pattern: node("⿻", sun, moon),
    dictionary: [],
    targets: [node("⿻", sun, moon)],
  },
  {
    name: "nested-overlay-forward",
    pattern: node("⿱", fire, node("⿻", sun, moon)),
    dictionary: [],
    targets: [node("⿱", fire, overlaid(sun, moon))],
  },
  {
    name: "nested-overlay-reverse",
    pattern: node("⿱", fire, node("⿻", sun, moon)),
    dictionary: [],
    targets: [node("⿱", fire, overlaid(moon, sun))],
  },
  {
    name: "resolved-overlay-child-forward",
    pattern: node("⿻", bright, fire),
    dictionary: [brightDict],
    targets: [overlaid(brightVertical, fire)],
  },
  {
    name: "resolved-overlay-child-reverse",
    pattern: node("⿻", bright, fire),
    dictionary: [brightDict],
    targets: [overlaid(fire, brightHorizontal)],
  },
  {
    name: "resolved-overlay-child-negative",
    pattern: node("⿻", bright, fire),
    dictionary: [brightDict],
    targets: [overlaid(bright, fire)],
  },
  {
    name: "sibling-overlays-compose",
    pattern: node("⿰", node("⿻", sun, moon), node("⿻", fire, earth)),
    dictionary: [],
    targets: [node("⿰", overlaid(moon, sun), overlaid(fire, earth))],
  },
  {
    name: "wildcard-overlay-child",
    pattern: node("⿻", wildcard, bright),
    dictionary: [brightDict],
    targets: [overlaid(node("⿱", fire, earth), brightHorizontal)],
  },
  {
    name: "non-overlay-resolution-control",
    pattern: node("⿰", bright, fire),
    dictionary: [brightDict],
    targets: [node("⿰", brightVertical, fire)],
  },
  {
    name: "materialized-operator-mismatch",
    pattern: node("⿻", sun, moon),
    dictionary: [],
    targets: [node("&OTHER;", leaf("&H;"), sun, moon)],
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

async function actualMatch(testCase: TestCase, ftsModule: FtsModule): Promise<boolean> {
  const db = new Database(":memory:")
  try {
    const ftsDefinition = ftsModule === "fts4"
      ? `fts4 (IDS_tokens, content='', tokenize=unicode61 "tokenchars=&;§⿰⿱⿲⿳⿻")`
      : `fts5 (IDS_tokens, content='', tokenize="unicode61 tokenchars '&;§⿰⿱⿲⿳⿻'")`
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE VIRTUAL TABLE idsfind_fts USING ${ftsDefinition};
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

    const idsfind = createIdsfind(async () => createBetterSqlite3Executor(db))
    return (await idsfind([
      `§${tokens(testCase.pattern).join("")}§`,
    ])).includes("TARGET")
  } finally {
    db.close()
  }
}

const oraclePath = process.argv[2] ?? process.env.LEAN_IDSFLOW_ORACLE
if (!oraclePath) {
  throw new Error(
    "Usage: differential-idsflow-decomposed-search <path-to-ids_search_verify>",
  )
}
const input = cases.map(testCase => JSON.stringify({
  version: 1,
  command: "decomposed-pattern-matches",
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
  const byModule: Record<FtsModule, { checks: number; mismatches: number }> = {
    fts4: { checks: 0, mismatches: 0 },
    fts5: { checks: 0, mismatches: 0 },
  }
  let positiveCases = 0, negativeCases = 0
  for (const [index, testCase] of cases.entries()) {
    const expected = responses[index]
    if (expected.error || typeof expected.matched !== "boolean") {
      mismatches.push({ name: testCase.name, oracleResponse: expected })
      continue
    }
    expected.matched ? positiveCases++ : negativeCases++
    for (const ftsModule of ["fts4", "fts5"] as const) {
      const actual = await actualMatch(testCase, ftsModule)
      byModule[ftsModule].checks++
      if (expected.matched !== actual) {
        byModule[ftsModule].mismatches++
        mismatches.push({
          name: testCase.name,
          ftsModule,
          expected: expected.matched,
          actual,
          source: tokens(testCase.pattern),
          targets: testCase.targets.map(tokens),
        })
      }
    }
  }
  console.log(JSON.stringify({
    protocolVersion: 1,
    cases: cases.length,
    checks: Object.values(byModule).reduce((sum, item) => sum + item.checks, 0),
    positiveCases,
    negativeCases,
    maxPatternDepth: Math.max(...cases.map(item => depth(item.pattern))),
    maxOverlayOccurrences: Math.max(...cases.map(item =>
      tokens(item.pattern).filter(token => token === "⿻").length
    )),
    mismatches: mismatches.length,
    byModule,
  }, null, 2))
  if (mismatches.length > 0) {
    console.error(JSON.stringify(mismatches, null, 2))
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
