import { spawnSync } from "node:child_process"
import Database from "better-sqlite3"
import { createBetterSqlite3Executor } from "@mandel59/mojidata-api-better-sqlite3"
import {
  createIdsfind,
  ftsIdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core/lib/idsfind-sql"

type PatternNode = { token: string; children: PatternNode[] }
type WireNode = { token: string; arity: number }
type DictionaryEntry = { token: string; alternatives: PatternNode[] }
type TestCase = {
  name: string
  groups: PatternNode[]
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
const leftBright = node("⿰", bright, wildcard)
const rightFire = node("⿰", wildcard, fire)

const cases: TestCase[] = [
  {
    name: "two-groups-same-row-positive",
    groups: [leftBright, rightFire],
    dictionary: [brightDict],
    targets: [node("⿰", brightHorizontal, fire)],
  },
  {
    name: "groups-must-not-cross-target-rows",
    groups: [leftBright, rightFire],
    dictionary: [brightDict],
    targets: [
      node("⿰", brightVertical, earth),
      node("⿰", sun, fire),
    ],
  },
  {
    name: "definition-alternatives-are-or",
    groups: [bright],
    dictionary: [brightDict],
    targets: [brightVertical],
  },
  {
    name: "duplicate-definition-does-not-change-answer",
    groups: [bright],
    dictionary: [{
      token: "明",
      alternatives: [brightHorizontal, brightHorizontal, brightVertical],
    }],
    targets: [brightHorizontal],
  },
  {
    name: "duplicate-query-groups-remain-conjunction",
    groups: [bright, bright],
    dictionary: [brightDict],
    targets: [brightVertical],
  },
  {
    name: "overlay-alternative-and-second-group",
    groups: [
      node("⿻", sun, moon),
      node("&OL3;", wildcard, sun, moon),
    ],
    dictionary: [],
    targets: [overlaid(sun, moon)],
  },
  {
    name: "overlay-groups-can-conflict",
    groups: [
      node("⿻", sun, moon),
      node("&OL3;", wildcard, sun, moon),
    ],
    dictionary: [],
    targets: [overlaid(moon, sun)],
  },
  {
    name: "one-of-several-target-rows-satisfies-all-groups",
    groups: [leftBright, rightFire],
    dictionary: [brightDict],
    targets: [
      node("⿰", brightHorizontal, earth),
      node("⿰", brightVertical, fire),
    ],
  },
  {
    name: "operator-mismatch-in-one-group",
    groups: [leftBright, node("⿱", wildcard, fire)],
    dictionary: [brightDict],
    targets: [node("⿰", brightHorizontal, fire)],
  },
  {
    name: "duplicate-target-rows-do-not-change-answer",
    groups: [leftBright, rightFire],
    dictionary: [brightDict],
    targets: [
      node("⿰", brightHorizontal, fire),
      node("⿰", brightHorizontal, fire),
    ],
  },
  {
    name: "no-target-row",
    groups: [bright],
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

async function actualSearch(testCase: TestCase, ftsModule: FtsModule) {
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
        semantics_mode TEXT NOT NULL,
        semantics_profile TEXT,
        query_plan_json TEXT,
        recipe_sha256 TEXT
      );
      INSERT INTO idsfind_semantics VALUES (
        3,
        'registered',
        'idsflow-decompose@1',
        NULL,
        '0000000000000000000000000000000000000000000000000000000000000000'
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

    const executor = createBetterSqlite3Executor(db)
    let candidates: string[] = []
    const idsfind = createIdsfind(async () => executor, {
      async getCandidates(candidateDb, idslist, sourceIdslist, policy) {
        candidates = await ftsIdsfindCandidateProvider.getCandidates(
          candidateDb,
          idslist,
          sourceIdslist,
          policy,
        )
        return candidates
      },
    })
    const queries = testCase.groups.map(pattern =>
      `§${tokens(pattern).join("")}§`
    )
    return {
      matched: (await idsfind(queries)).includes("TARGET"),
      targetCandidateOccurrences:
        candidates.filter(candidate => candidate === "TARGET").length,
    }
  } finally {
    db.close()
  }
}

const oraclePath = process.argv[2] ?? process.env.LEAN_IDSFLOW_ORACLE
if (!oraclePath) {
  throw new Error(
    "Usage: differential-idsflow-query-groups <path-to-ids_search_verify>",
  )
}
const input = cases.map(testCase => JSON.stringify({
  version: 1,
  command: "decomposed-pattern-groups-match",
  groups: testCase.groups.map(wire),
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
  const candidateMultiplicityViolations: unknown[] = []
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
      const actual = await actualSearch(testCase, ftsModule)
      byModule[ftsModule].checks++
      if (actual.targetCandidateOccurrences > 1) {
        candidateMultiplicityViolations.push({
          name: testCase.name,
          ftsModule,
          targetCandidateOccurrences: actual.targetCandidateOccurrences,
        })
      }
      if (expected.matched !== actual.matched) {
        byModule[ftsModule].mismatches++
        mismatches.push({
          name: testCase.name,
          ftsModule,
          expected: expected.matched,
          actual: actual.matched,
          groups: testCase.groups.map(tokens),
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
    maxGroups: Math.max(...cases.map(item => item.groups.length)),
    maxDefinitionsPerToken: Math.max(...cases.flatMap(item =>
      item.dictionary.map(entry => entry.alternatives.length)
    )),
    maxTargetRows: Math.max(...cases.map(item => item.targets.length)),
    mismatches: mismatches.length,
    candidateMultiplicityViolations: candidateMultiplicityViolations.length,
    byModule,
  }, null, 2))
  if (mismatches.length > 0 || candidateMultiplicityViolations.length > 0) {
    console.error(JSON.stringify({
      mismatches,
      candidateMultiplicityViolations,
    }, null, 2))
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
