import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import Database from "better-sqlite3"
import { createBetterSqlite3Executor } from "@mandel59/mojidata-api-better-sqlite3"
import { createIdsfind } from "@mandel59/mojidata-api-core/lib/idsfind-sql"

type Tree = { token: string; children: Tree[] }
type WireNode = { token: string; arity: number }
type DictionaryEntry = { token: string; alternatives: Tree[] }
type SeedCase = { name: string; pattern: Tree; source: Tree }
type TestCase = SeedCase & {
  kind: "preservation-witness" | "negative-control"
  target: Tree
  expectedOracleMatch: boolean
}
type OracleResponse = {
  version: number
  command?: string
  matched?: boolean
  error?: string
}
type FtsModule = "fts4" | "fts5"
type Observation = {
  case: string
  kind: TestCase["kind"]
  ftsModule: FtsModule
  oracleMatched: boolean
  productionMatched: boolean
  status: "agrees" | "false-negative" | "false-positive"
}

const leaf = (token: string): Tree => ({ token, children: [] })
const node = (token: string, ...children: Tree[]): Tree => ({ token, children })
const wildcard = leaf("？")

const wood = leaf("木")
const water = leaf("水")
const metal = leaf("金")
const silk = leaf("糸")
const bamboo = leaf("竹")
const heart = leaf("心")
const speech = leaf("言")
const shell = leaf("貝")
const rain = leaf("雨")
const stone = leaf("石")
const mountain = leaf("山")
const field = leaf("田")
const grain = leaf("禾")
const mouth = leaf("口")
const alpha = leaf("甲")
const beta = leaf("乙")
const gamma = leaf("丙")

const dictionary: DictionaryEntry[] = [
  {
    token: "甲",
    alternatives: [node("⿰", wood, water), node("⿱", metal, silk)],
  },
  {
    token: "乙",
    alternatives: [node("⿱", bamboo, heart), node("⿲", speech, shell, rain)],
  },
  {
    token: "丙",
    alternatives: [node("⿰", mountain, field)],
  },
]
const dictionaryByToken = new Map(dictionary.map(entry => [entry.token, entry]))

const seeds: SeedCase[] = [
  { name: "root-overlay-a", pattern: node("⿻", wood, water), source: node("⿻", wood, water) },
  { name: "root-overlay-b", pattern: node("⿻", metal, silk), source: node("⿻", metal, silk) },
  {
    name: "nested-left-overlay",
    pattern: node("⿰", node("⿻", bamboo, heart), stone),
    source: node("⿰", node("⿻", bamboo, heart), stone),
  },
  {
    name: "nested-right-overlay",
    pattern: node("⿱", mountain, node("⿻", field, grain)),
    source: node("⿱", mountain, node("⿻", field, grain)),
  },
  {
    name: "sibling-overlays",
    pattern: node("⿰", node("⿻", wood, water), node("⿻", metal, silk)),
    source: node("⿰", node("⿻", wood, water), node("⿻", metal, silk)),
  },
  {
    name: "ternary-overlay",
    pattern: node("⿲", speech, node("⿻", shell, rain), stone),
    source: node("⿲", speech, node("⿻", shell, rain), stone),
  },
  {
    name: "overlay-wildcard",
    pattern: node("⿻", wildcard, water),
    source: node("⿻", node("⿰", mountain, field), water),
  },
  {
    name: "nested-wildcard",
    pattern: node("⿱", wildcard, node("⿻", wood, metal)),
    source: node("⿱", node("⿲", bamboo, heart, speech), node("⿻", wood, metal)),
  },
  { name: "root-component-alpha", pattern: alpha, source: alpha },
  { name: "root-component-beta", pattern: beta, source: beta },
  {
    name: "left-component",
    pattern: node("⿰", alpha, stone),
    source: node("⿰", alpha, stone),
  },
  {
    name: "right-component",
    pattern: node("⿱", mountain, beta),
    source: node("⿱", mountain, beta),
  },
  {
    name: "two-components",
    pattern: node("⿰", alpha, beta),
    source: node("⿰", alpha, beta),
  },
  {
    name: "repeated-component",
    pattern: node("⿱", alpha, alpha),
    source: node("⿱", alpha, alpha),
  },
  {
    name: "ternary-components",
    pattern: node("⿲", alpha, beta, gamma),
    source: node("⿲", alpha, beta, gamma),
  },
  {
    name: "nested-component",
    pattern: node("⿰", node("⿱", alpha, wood), beta),
    source: node("⿰", node("⿱", alpha, wood), beta),
  },
  {
    name: "overlay-component",
    pattern: node("⿻", alpha, stone),
    source: node("⿻", alpha, stone),
  },
  {
    name: "overlay-two-components",
    pattern: node("⿻", alpha, beta),
    source: node("⿻", alpha, beta),
  },
  {
    name: "nested-overlay-components",
    pattern: node("⿱", gamma, node("⿻", alpha, beta)),
    source: node("⿱", gamma, node("⿻", alpha, beta)),
  },
  {
    name: "wildcard-component",
    pattern: node("⿰", wildcard, alpha),
    source: node("⿰", node("⿲", speech, shell, rain), alpha),
  },
  {
    name: "sibling-overlay-components",
    pattern: node("⿰", node("⿻", alpha, wood), node("⿻", beta, gamma)),
    source: node("⿰", node("⿻", alpha, wood), node("⿻", beta, gamma)),
  },
  {
    name: "ternary-mixed",
    pattern: node("⿳", gamma, wildcard, node("⿻", beta, water)),
    source: node("⿳", gamma, node("⿰", stone, mouth), node("⿻", beta, water)),
  },
]

const priorFixtureAtoms = new Set(["日", "月", "火", "土", "明"])
const workloadAtoms = new Set([
  "木", "水", "金", "糸", "竹", "心", "言", "貝", "雨", "石", "山", "田", "禾", "口",
  "甲", "乙", "丙",
])
const atomOverlap = [...workloadAtoms].filter(token => priorFixtureAtoms.has(token))
if (atomOverlap.length > 0) {
  throw new Error(`S2 workload overlaps prior fixture atoms: ${atomOverlap.join(",")}`)
}

function matches(pattern: Tree, source: Tree): boolean {
  if (pattern.token === "？" && pattern.children.length === 0) return true
  return pattern.token === source.token &&
    pattern.children.length === source.children.length &&
    pattern.children.every((child, index) => matches(child, source.children[index]))
}

function materializeOverlaid(value: Tree, caseIndex: number) {
  let occurrence = 0
  const visit = (tree: Tree): Tree => {
    if (tree.token === "⿻" && tree.children.length === 2) {
      const current = occurrence++
      const left = visit(tree.children[0])
      const right = visit(tree.children[1])
      const children = (caseIndex + current) % 2 === 0
        ? [left, right]
        : [right, left]
      return node("&OL3;", leaf(`&S2H${caseIndex}N${current};`), ...children)
    }
    return node(tree.token, ...tree.children.map(visit))
  }
  return visit(value)
}

function resolveMaterializedComponents(value: Tree, caseIndex: number) {
  let occurrence = 0
  const visit = (tree: Tree): Tree => {
    if (tree.children.length === 0) {
      const entry = dictionaryByToken.get(tree.token)
      if (!entry) return tree
      const selected = entry.alternatives[(caseIndex + occurrence++) % entry.alternatives.length]
      return selected
    }
    return node(tree.token, ...tree.children.map(visit))
  }
  return visit(value)
}

function positiveTarget(seed: SeedCase, caseIndex: number) {
  return resolveMaterializedComponents(
    materializeOverlaid(seed.source, caseIndex),
    caseIndex,
  )
}

function negativeTarget(value: Tree, caseIndex: number): Tree {
  return node(`&S2BAD${caseIndex}A${value.children.length};`, ...value.children)
}

const cases: TestCase[] = seeds.flatMap((seed, caseIndex) => {
  if (!matches(seed.pattern, seed.source)) {
    throw new Error(`S2 source witness does not match pattern: ${seed.name}`)
  }
  const target = positiveTarget(seed, caseIndex)
  return [
    {
      ...seed,
      name: `${seed.name}-positive`,
      kind: "preservation-witness" as const,
      target,
      expectedOracleMatch: true,
    },
    {
      ...seed,
      name: `${seed.name}-negative-control`,
      kind: "negative-control" as const,
      target: negativeTarget(target, caseIndex),
      expectedOracleMatch: false,
    },
  ]
})

function wire(value: Tree): WireNode[] {
  return [{ token: value.token, arity: value.children.length }, ...value.children.flatMap(wire)]
}

function tokens(value: Tree): string[] {
  return [value.token, ...value.children.flatMap(tokens)]
}

function depth(value: Tree): number {
  return value.children.length === 0 ? 0 : 1 + Math.max(...value.children.map(depth))
}

async function productionMatch(testCase: TestCase, ftsModule: FtsModule) {
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
    const insertIds = db.prepare("INSERT INTO idsfind (UCS, IDS_tokens) VALUES (?, ?)")
    const insertFts = db.prepare(
      "INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (?, ?)",
    )
    const insertTree = (ucs: string, value: Tree) => {
      const serialized = tokens(value).join(" ")
      const inserted = insertIds.run(ucs, serialized)
      insertFts.run(inserted.lastInsertRowid, `§ ${serialized} §`)
    }
    for (const entry of dictionary) {
      for (const alternative of entry.alternatives) insertTree(entry.token, alternative)
    }
    insertTree("TARGET", testCase.target)

    const idsfind = createIdsfind(
      async () => createBetterSqlite3Executor(db),
      undefined,
      { requireRegisteredQuerySemantics: true },
    )
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
    "Usage: evaluate-idsflow-s2-preservation <path-to-ids_search_verify>",
  )
}
const oracleInput = cases.map(testCase => JSON.stringify({
  version: 1,
  command: "decomposed-pattern-matches",
  nodes: wire(testCase.pattern),
  dictionary: dictionary.map(entry => ({
    token: entry.token,
    alternatives: entry.alternatives.map(wire),
  })),
  targets: [wire(testCase.target)],
})).join("\n") + "\n"
const oracle = spawnSync(oraclePath, ["--jsonl"], {
  input: oracleInput,
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
})
if (oracle.error) throw oracle.error
if (oracle.status !== 0) {
  throw new Error(`Lean oracle failed (${oracle.status}): ${oracle.stderr}`)
}
const responses = oracle.stdout.trim().split(/\r?\n/u)
  .map(line => JSON.parse(line) as OracleResponse)
if (responses.length !== cases.length) {
  throw new Error(`Expected ${cases.length} oracle responses, got ${responses.length}`)
}

async function main() {
  const observations: Observation[] = []
  const oracleErrors: unknown[] = []
  let oracleExpectationMismatches = 0
  for (const [index, testCase] of cases.entries()) {
    const response = responses[index]
    if (response.error || typeof response.matched !== "boolean") {
      oracleErrors.push({ case: testCase.name, response })
      continue
    }
    if (response.matched !== testCase.expectedOracleMatch) {
      oracleExpectationMismatches++
    }
    for (const ftsModule of ["fts4", "fts5"] as const) {
      const actual = await productionMatch(testCase, ftsModule)
      const status = actual === response.matched
        ? "agrees"
        : response.matched
        ? "false-negative"
        : "false-positive"
      observations.push({
        case: testCase.name,
        kind: testCase.kind,
        ftsModule,
        oracleMatched: response.matched,
        productionMatched: actual,
        status,
      })
    }
  }

  const falseNegatives = observations.filter(item => item.status === "false-negative").length
  const falsePositives = observations.filter(item => item.status === "false-positive").length
  const byModule = Object.fromEntries((["fts4", "fts5"] as const).map(ftsModule => {
    const rows = observations.filter(item => item.ftsModule === ftsModule)
    return [ftsModule, {
      checks: rows.length,
      falseNegatives: rows.filter(item => item.status === "false-negative").length,
      falsePositives: rows.filter(item => item.status === "false-positive").length,
    }]
  }))
  const passed = oracleErrors.length === 0 &&
    oracleExpectationMismatches === 0 &&
    falseNegatives === 0 &&
    falsePositives === 0

  console.log(JSON.stringify({
    schemaVersion: 1,
    purpose: "idsflow-s2-independent-preservation",
    workloadVersion: 1,
    timingIncluded: false,
    independence: {
      criterion: "domain-atom-disjoint-from-s1-and-prior-composed-fixtures",
      priorFixtureAtoms: [...priorFixtureAtoms],
      workloadAtoms: [...workloadAtoms],
      overlap: atomOverlap,
    },
    oracle: {
      protocol: "decomposed-pattern-matches@1",
      executableSha256: createHash("sha256")
        .update(readFileSync(oraclePath))
        .digest("hex"),
      errors: oracleErrors,
      expectationMismatches: oracleExpectationMismatches,
    },
    cases: cases.map(testCase => ({
      name: testCase.name,
      kind: testCase.kind,
      pattern: tokens(testCase.pattern),
      sourceWitness: tokens(testCase.source),
      target: tokens(testCase.target),
      expectedOracleMatch: testCase.expectedOracleMatch,
    })),
    dictionary: dictionary.map(entry => ({
      token: entry.token,
      alternatives: entry.alternatives.map(tokens),
    })),
    summary: {
      seedCases: seeds.length,
      cases: cases.length,
      preservationWitnesses: cases.filter(item =>
        item.kind === "preservation-witness"
      ).length,
      negativeControls: cases.filter(item => item.kind === "negative-control").length,
      checks: observations.length,
      maxPatternDepth: Math.max(...cases.map(item => depth(item.pattern))),
      maxOverlayOccurrences: Math.max(...cases.map(item =>
        tokens(item.pattern).filter(token => token === "⿻").length
      )),
      falseNegatives,
      falsePositives,
      byModule,
    },
    observations,
    gate: {
      name: "S2-preservation",
      requiredFalseNegatives: 0,
      passed,
    },
  }, null, 2))
  if (!passed) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
