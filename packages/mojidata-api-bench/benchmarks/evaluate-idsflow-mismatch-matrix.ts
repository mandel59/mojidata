import Database from "better-sqlite3"
import { createBetterSqlite3Executor } from "@mandel59/mojidata-api-better-sqlite3"
import { createIdsfind } from "@mandel59/mojidata-api-core/lib/idsfind-sql"

type Tree = { token: string; children: Tree[] }
type DictionaryEntry = { token: string; alternatives: Tree[] }
type CorpusSemantics = "records" | "decompose"
type SemanticOperation =
  | "identity-control"
  | "expand-overlaid"
  | "resolve-materialized-components"
type FtsModule = "fts4" | "fts5"
type TestCase = {
  name: string
  operation: SemanticOperation
  corpusSemantics: CorpusSemantics
  query: Tree
  dictionary: DictionaryEntry[]
  targets: Tree[]
  expectedMatch: boolean
}
type PlanVariant = {
  name:
    | "registered-correct"
    | "fixed-identity"
    | "fixed-decompose"
    | "legacy-no-manifest"
    | "incompatible-registered"
    | "experimental-without-opt-in"
  manifest:
    | { kind: "none" }
    | { kind: "registered"; profile: string }
    | { kind: "experimental"; queryPlan: unknown }
  allowExperimental?: boolean
  requireRegistered?: boolean
}
type Status =
  | "agrees"
  | "silent-false-negative"
  | "silent-false-positive"
  | "explicit-rejection"

type Observation = {
  case: string
  operation: SemanticOperation
  corpusSemantics: CorpusSemantics
  expectedMatch: boolean
  variant: PlanVariant["name"]
  ftsModule: FtsModule
  status: Status
  actualMatch?: boolean
  error?: string
}

const leaf = (token: string): Tree => ({ token, children: [] })
const node = (token: string, ...children: Tree[]): Tree => ({ token, children })
const overlaid = (left: Tree, right: Tree): Tree =>
  node("&OL3;", leaf("&H;"), left, right)

const sun = leaf("日")
const moon = leaf("月")
const fire = leaf("火")
const earth = leaf("土")
const bright = leaf("明")
const brightDefinition = node("⿱", sun, moon)
const brightDictionary: DictionaryEntry[] = [{
  token: "明",
  alternatives: [brightDefinition],
}]

// This is the frozen semantic workload. Expected results describe the corpus
// semantics, before a query-plan variant is selected.
const cases: TestCase[] = [
  {
    name: "identity-control-positive",
    operation: "identity-control",
    corpusSemantics: "records",
    query: node("⿰", sun, moon),
    dictionary: [],
    targets: [node("⿰", sun, moon)],
    expectedMatch: true,
  },
  {
    name: "raw-overlay-positive",
    operation: "expand-overlaid",
    corpusSemantics: "records",
    query: node("⿻", sun, moon),
    dictionary: [],
    targets: [node("⿻", sun, moon)],
    expectedMatch: true,
  },
  {
    name: "expanded-overlay-positive",
    operation: "expand-overlaid",
    corpusSemantics: "decompose",
    query: node("⿻", sun, moon),
    dictionary: [],
    targets: [overlaid(moon, sun)],
    expectedMatch: true,
  },
  {
    name: "raw-materialized-overlay-negative",
    operation: "expand-overlaid",
    corpusSemantics: "records",
    query: node("⿻", sun, moon),
    dictionary: [],
    targets: [overlaid(sun, moon)],
    expectedMatch: false,
  },
  {
    name: "raw-component-positive",
    operation: "resolve-materialized-components",
    corpusSemantics: "records",
    query: node("⿰", bright, fire),
    dictionary: brightDictionary,
    targets: [node("⿰", bright, fire)],
    expectedMatch: true,
  },
  {
    name: "resolved-component-positive",
    operation: "resolve-materialized-components",
    corpusSemantics: "decompose",
    query: node("⿰", bright, fire),
    dictionary: brightDictionary,
    targets: [node("⿰", brightDefinition, fire)],
    expectedMatch: true,
  },
  {
    name: "raw-materialized-component-negative",
    operation: "resolve-materialized-components",
    corpusSemantics: "records",
    query: node("⿰", bright, fire),
    dictionary: brightDictionary,
    targets: [node("⿰", brightDefinition, fire)],
    expectedMatch: false,
  },
  {
    name: "identity-control-negative",
    operation: "identity-control",
    corpusSemantics: "records",
    query: node("⿰", sun, moon),
    dictionary: [],
    targets: [node("⿰", sun, earth)],
    expectedMatch: false,
  },
]

const identityPlan = { version: 1, transforms: [] }
const decomposePlan = {
  version: 1,
  transforms: [
    { op: "expand-overlaid", version: 1 },
    { op: "resolve-materialized-components", version: 1 },
  ],
}
const correctProfile = (testCase: TestCase) =>
  testCase.corpusSemantics === "records"
    ? "idsflow-records@1"
    : "idsflow-decompose@1"

const variantsFor = (testCase: TestCase): PlanVariant[] => [
  {
    name: "registered-correct",
    manifest: { kind: "registered", profile: correctProfile(testCase) },
    requireRegistered: true,
  },
  {
    name: "fixed-identity",
    manifest: { kind: "experimental", queryPlan: identityPlan },
    allowExperimental: true,
  },
  {
    name: "fixed-decompose",
    manifest: { kind: "experimental", queryPlan: decomposePlan },
    allowExperimental: true,
  },
  {
    name: "legacy-no-manifest",
    manifest: { kind: "none" },
  },
  {
    name: "incompatible-registered",
    manifest: { kind: "registered", profile: "idsflow-unknown@1" },
  },
  {
    name: "experimental-without-opt-in",
    manifest: {
      kind: "experimental",
      queryPlan: testCase.corpusSemantics === "records"
        ? identityPlan
        : decomposePlan,
    },
  },
]

function flatten(value: Tree): string[] {
  return [value.token, ...value.children.flatMap(flatten)]
}

function createManifest(db: Database.Database, variant: PlanVariant) {
  if (variant.manifest.kind === "none") return
  db.exec(`
    CREATE TABLE idsfind_semantics (
      schema_version INTEGER PRIMARY KEY,
      semantics_mode TEXT NOT NULL,
      semantics_profile TEXT,
      query_plan_json TEXT,
      recipe_sha256 TEXT
    )
  `)
  if (variant.manifest.kind === "registered") {
    db.prepare(`
      INSERT INTO idsfind_semantics VALUES (3, 'registered', ?, NULL, ?)
    `).run(variant.manifest.profile, "0".repeat(64))
  } else {
    db.prepare(`
      INSERT INTO idsfind_semantics VALUES (3, 'experimental', NULL, ?, ?)
    `).run(JSON.stringify(variant.manifest.queryPlan), "0".repeat(64))
  }
}

async function observe(
  testCase: TestCase,
  variant: PlanVariant,
  ftsModule: FtsModule,
) {
  const db = new Database(":memory:")
  try {
    const ftsDefinition = ftsModule === "fts4"
      ? `fts4 (IDS_tokens, content='', tokenize=unicode61 "tokenchars=&;§⿰⿱⿲⿳⿻")`
      : `fts5 (IDS_tokens, content='', tokenize="unicode61 tokenchars '&;§⿰⿱⿲⿳⿻'")`
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE VIRTUAL TABLE idsfind_fts USING ${ftsDefinition};
    `)
    createManifest(db, variant)
    const insertIds = db.prepare(
      "INSERT INTO idsfind (UCS, IDS_tokens) VALUES (?, ?)",
    )
    const insertFts = db.prepare(
      "INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (?, ?)",
    )
    const insertTree = (ucs: string, value: Tree) => {
      const serialized = flatten(value).join(" ")
      const inserted = insertIds.run(ucs, serialized)
      insertFts.run(inserted.lastInsertRowid, `§ ${serialized} §`)
    }
    for (const entry of testCase.dictionary) {
      for (const alternative of entry.alternatives) {
        insertTree(entry.token, alternative)
      }
    }
    for (const target of testCase.targets) insertTree("TARGET", target)

    const idsfind = createIdsfind(
      async () => createBetterSqlite3Executor(db),
      undefined,
      {
        allowExperimentalQueryPlan: variant.allowExperimental,
        requireRegisteredQuerySemantics: variant.requireRegistered,
      },
    )
    const actualMatch = (await idsfind([
      `§${flatten(testCase.query).join("")}§`,
    ])).includes("TARGET")
    const status: Status = actualMatch === testCase.expectedMatch
      ? "agrees"
      : testCase.expectedMatch
      ? "silent-false-negative"
      : "silent-false-positive"
    return { status, actualMatch }
  } catch (error) {
    return {
      status: "explicit-rejection" as const,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    db.close()
  }
}

async function main() {
  const observations: Observation[] = []
  for (const testCase of cases) {
    for (const variant of variantsFor(testCase)) {
      for (const ftsModule of ["fts4", "fts5"] as const) {
        observations.push({
          case: testCase.name,
          operation: testCase.operation,
          corpusSemantics: testCase.corpusSemantics,
          expectedMatch: testCase.expectedMatch,
          variant: variant.name,
          ftsModule,
          ...await observe(testCase, variant, ftsModule),
        })
      }
    }
  }

  const variantNames = [...new Set(observations.map(item => item.variant))]
  const byVariant = Object.fromEntries(variantNames.map(variant => {
    const rows = observations.filter(item => item.variant === variant)
    return [variant, Object.fromEntries([
      "agrees",
      "silent-false-negative",
      "silent-false-positive",
      "explicit-rejection",
    ].map(status => [status, rows.filter(item => item.status === status).length]))]
  }))
  const semanticOperations = [
    "expand-overlaid",
    "resolve-materialized-components",
  ] as const
  const operationsWithSilentMismatch = semanticOperations.filter(operation =>
    observations.some(item =>
      item.operation === operation &&
      (item.status === "silent-false-negative" ||
        item.status === "silent-false-positive")
    )
  )
  const correctRows = observations.filter(item =>
    item.variant === "registered-correct"
  )
  const incompatibleRows = observations.filter(item =>
    item.variant === "incompatible-registered" ||
    item.variant === "experimental-without-opt-in"
  )
  const gate = {
    requiredOperations: semanticOperations.length,
    operationsWithSilentMismatch,
    correctProfileChecks: correctRows.length,
    correctProfileDisagreements: correctRows.filter(item => item.status !== "agrees").length,
    incompatibleChecks: incompatibleRows.length,
    incompatibleNotRejected: incompatibleRows.filter(item =>
      item.status !== "explicit-rejection"
    ).length,
  }
  const passed =
    operationsWithSilentMismatch.length === semanticOperations.length &&
    gate.correctProfileDisagreements === 0 &&
    gate.incompatibleNotRejected === 0

  console.log(JSON.stringify({
    schemaVersion: 1,
    purpose: "idsflow-s1-mismatch-materiality",
    timingIncluded: false,
    cases: cases.map(testCase => ({
      name: testCase.name,
      operation: testCase.operation,
      corpusSemantics: testCase.corpusSemantics,
      query: flatten(testCase.query),
      dictionary: testCase.dictionary.map(entry => ({
        token: entry.token,
        alternatives: entry.alternatives.map(flatten),
      })),
      targets: testCase.targets.map(flatten),
      expectedMatch: testCase.expectedMatch,
    })),
    observations,
    byVariant,
    gate: { ...gate, passed },
  }, null, 2))
  if (!passed) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
