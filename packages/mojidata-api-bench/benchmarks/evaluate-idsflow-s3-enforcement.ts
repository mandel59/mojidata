import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { basename } from "node:path"
import Database from "better-sqlite3"
import {
  getRegisteredIdsQuerySemantics,
  idsQuerySemanticsProfiles,
} from "@mandel59/idsdb-utils"
import { createBetterSqlite3Executor } from "@mandel59/mojidata-api-better-sqlite3"
import {
  createSqlApiDb,
  type CreateIdsfindOptions,
} from "@mandel59/mojidata-api-core"

type Expected =
  | { kind: "accept" }
  | { kind: "reject"; message: RegExp }
type EnforcementCase = {
  name: string
  idsfindOptions?: CreateIdsfindOptions
  setupSql: string
  expected: Expected
}
type Observation = {
  name: string
  expected: Expected["kind"]
  outcome: "accepted" | "explicit-rejection" | "wrong-error" | "unexpected-accept"
  result?: string[]
  error?: string
}

const zeroSha = "0".repeat(64)
const identityPlan = JSON.stringify({ version: 1, transforms: [] })
const decomposePlan = JSON.stringify({
  version: 1,
  transforms: [
    { op: "expand-overlaid", version: 1 },
    { op: "resolve-materialized-components", version: 1 },
  ],
})

function sqlLiteral(value: string | null) {
  if (value === null) return "NULL"
  return `'${value.split("'").join("''")}'`
}

function schema3Sql({
  mode,
  profile,
  queryPlan,
  recipeSha = zeroSha,
}: {
  mode: string
  profile: string | null
  queryPlan: string | null
  recipeSha?: string | null
}) {
  return `
    CREATE TABLE idsfind_semantics (
      schema_version INTEGER PRIMARY KEY,
      semantics_mode TEXT NOT NULL,
      semantics_profile TEXT,
      query_plan_json TEXT,
      recipe_sha256 TEXT
    );
    INSERT INTO idsfind_semantics VALUES (
      3,
      ${sqlLiteral(mode)},
      ${sqlLiteral(profile)},
      ${sqlLiteral(queryPlan)},
      ${sqlLiteral(recipeSha)}
    );
  `
}

const strict = { requireRegisteredQuerySemantics: true }
const cases: EnforcementCase[] = [
  {
    name: "valid-records-strict",
    idsfindOptions: strict,
    setupSql: schema3Sql({
      mode: "registered",
      profile: "idsflow-records@1",
      queryPlan: null,
    }),
    expected: { kind: "accept" },
  },
  {
    name: "valid-decompose-strict",
    idsfindOptions: strict,
    setupSql: schema3Sql({
      mode: "registered",
      profile: "idsflow-decompose@1",
      queryPlan: null,
    }),
    expected: { kind: "accept" },
  },
  {
    name: "missing-manifest-strict",
    idsfindOptions: strict,
    setupSql: "",
    expected: {
      kind: "reject",
      message: /strict IDS query semantics require a schema 3 registered manifest/u,
    },
  },
  {
    name: "schema-1-strict",
    idsfindOptions: strict,
    setupSql: `
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        query_plan_json TEXT NOT NULL
      );
      INSERT INTO idsfind_semantics VALUES (1, ${sqlLiteral(identityPlan)});
    `,
    expected: {
      kind: "reject",
      message: /strict IDS query semantics require a schema 3 registered manifest/u,
    },
  },
  {
    name: "schema-2-strict",
    idsfindOptions: strict,
    setupSql: `
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        semantics_profile TEXT NOT NULL,
        recipe_sha256 TEXT
      );
      INSERT INTO idsfind_semantics VALUES (2, 'idsflow-records@1', '${zeroSha}');
    `,
    expected: {
      kind: "reject",
      message: /strict IDS query semantics require a schema 3 registered manifest/u,
    },
  },
  {
    name: "experimental-strict-even-with-opt-in",
    idsfindOptions: {
      allowExperimentalQueryPlan: true,
      requireRegisteredQuerySemantics: true,
    },
    setupSql: schema3Sql({
      mode: "experimental",
      profile: null,
      queryPlan: identityPlan,
    }),
    expected: {
      kind: "reject",
      message: /strict IDS query semantics require a registered manifest/u,
    },
  },
  {
    name: "unknown-registered-profile",
    setupSql: schema3Sql({
      mode: "registered",
      profile: "idsflow-unknown@1",
      queryPlan: null,
    }),
    expected: {
      kind: "reject",
      message: /unsupported IDS query semantics profile/u,
    },
  },
  {
    name: "unsupported-semantics-mode",
    setupSql: schema3Sql({ mode: "future", profile: null, queryPlan: null }),
    expected: {
      kind: "reject",
      message: /unsupported IDS query semantics mode/u,
    },
  },
  {
    name: "registered-embeds-query-plan",
    setupSql: schema3Sql({
      mode: "registered",
      profile: "idsflow-records@1",
      queryPlan: identityPlan,
    }),
    expected: {
      kind: "reject",
      message: /registered IDS query semantics must not embed a query plan/u,
    },
  },
  {
    name: "experimental-uses-profile",
    idsfindOptions: { allowExperimentalQueryPlan: true },
    setupSql: schema3Sql({
      mode: "experimental",
      profile: "idsflow-records@1",
      queryPlan: identityPlan,
    }),
    expected: {
      kind: "reject",
      message: /experimental IDS query semantics must not use a profile/u,
    },
  },
  {
    name: "experimental-without-opt-in",
    setupSql: schema3Sql({
      mode: "experimental",
      profile: null,
      queryPlan: decomposePlan,
    }),
    expected: {
      kind: "reject",
      message: /experimental IDS query semantics require explicit runtime opt-in/u,
    },
  },
  {
    name: "experimental-malformed-json",
    idsfindOptions: { allowExperimentalQueryPlan: true },
    setupSql: schema3Sql({
      mode: "experimental",
      profile: null,
      queryPlan: "{",
    }),
    expected: {
      kind: "reject",
      message: /query plan is not valid JSON/u,
    },
  },
  {
    name: "invalid-recipe-identity",
    setupSql: schema3Sql({
      mode: "registered",
      profile: "idsflow-records@1",
      queryPlan: null,
      recipeSha: "not-a-sha",
    }),
    expected: {
      kind: "reject",
      message: /invalid recipe identity/u,
    },
  },
  {
    name: "schema-3-missing-recipe-field",
    setupSql: `
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        semantics_mode TEXT NOT NULL,
        semantics_profile TEXT,
        query_plan_json TEXT
      );
      INSERT INTO idsfind_semantics VALUES (
        3, 'registered', 'idsflow-records@1', NULL
      );
    `,
    expected: {
      kind: "reject",
      message: /schema 3 has no recipe identity field/u,
    },
  },
  {
    name: "manifest-table-without-row",
    setupSql: `
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        semantics_mode TEXT,
        semantics_profile TEXT,
        query_plan_json TEXT,
        recipe_sha256 TEXT
      );
    `,
    expected: { kind: "reject", message: /has no manifest row/u },
  },
  {
    name: "unsupported-schema-version",
    setupSql: `
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        query_plan_json TEXT NOT NULL
      );
      INSERT INTO idsfind_semantics VALUES (4, ${sqlLiteral(identityPlan)});
    `,
    expected: {
      kind: "reject",
      message: /unsupported idsfind_semantics schema version: 4/u,
    },
  },
]

function createFixture(testCase: EnforcementCase) {
  const db = new Database(":memory:")
  db.exec(`
    CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
    CREATE VIRTUAL TABLE idsfind_fts USING fts5 (
      IDS_tokens,
      content='',
      tokenize="unicode61 tokenchars '&;§⿰⿱⿲⿳⿻'"
    );
    INSERT INTO idsfind VALUES ('TARGET', '木');
    INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (1, '§ 木 §');
    ${testCase.setupSql}
  `)
  return db
}

async function observe(testCase: EnforcementCase): Promise<Observation> {
  const db = createFixture(testCase)
  try {
    const executor = createBetterSqlite3Executor(db)
    const api = createSqlApiDb({
      getMojidataDb: async () => executor,
      getIdsfindDb: async () => executor,
      idsfindOptions: testCase.idsfindOptions,
    })
    try {
      const result = await api.idsfind(["§木§"])
      return testCase.expected.kind === "accept"
        ? { name: testCase.name, expected: "accept", outcome: "accepted", result }
        : {
          name: testCase.name,
          expected: "reject",
          outcome: "unexpected-accept",
          result,
        }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (testCase.expected.kind === "accept") {
        return {
          name: testCase.name,
          expected: "accept",
          outcome: "wrong-error",
          error: message,
        }
      }
      return {
        name: testCase.name,
        expected: "reject",
        outcome: testCase.expected.message.test(message)
          ? "explicit-rejection"
          : "wrong-error",
        error: message,
      }
    }
  } finally {
    db.close()
  }
}

function loadArtifact(path: string, expectedPurpose: string) {
  const bytes = readFileSync(path)
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, any>
  if (value.purpose !== expectedPurpose || value.gate?.passed !== true) {
    throw new Error(`Artifact does not contain a passed ${expectedPurpose} gate: ${path}`)
  }
  return {
    file: basename(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    schemaVersion: value.schemaVersion,
    purpose: value.purpose,
  }
}

const [s1Path, s2Path, phasePath] = process.argv.slice(2)
if (!s1Path || !s2Path || !phasePath) {
  throw new Error(
    "Usage: evaluate-idsflow-s3-enforcement <s1-artifact> <s2-artifact> <phase-artifact>",
  )
}
const s1Artifact = loadArtifact(s1Path, "idsflow-s1-mismatch-materiality")
const s2Artifact = loadArtifact(s2Path, "idsflow-s2-independent-preservation")
const phaseBytes = readFileSync(phasePath)
JSON.parse(phaseBytes.toString("utf8"))
const phaseArtifact = {
  file: basename(phasePath),
  sha256: createHash("sha256").update(phaseBytes).digest("hex"),
}

const profiles = Object.values(idsQuerySemanticsProfiles).map(profile => ({
  profile,
  ...getRegisteredIdsQuerySemantics(profile),
}))

const deploymentBoundaries = [
  {
    runtime: "core createSqlApiDb",
    locator: "packages/mojidata-api-core/lib/mojidata-api-db-sql.ts",
    strictCapability: "direct-option",
  },
  {
    runtime: "better-sqlite3",
    locator: "packages/mojidata-api-better-sqlite3/lib/better-sqlite3-runtime.ts",
    strictCapability: "factory-option",
  },
  {
    runtime: "node:sqlite",
    locator: "packages/mojidata-api-node-sqlite/lib/node-sqlite-runtime.ts",
    strictCapability: "factory-option",
  },
  {
    runtime: "sql.js node",
    locator: "packages/mojidata-api-sqljs/lib/sqljs-runtime.ts",
    strictCapability: "factory-option",
  },
  {
    runtime: "sql.js browser worker",
    locator: "packages/mojidata-api-sqljs/lib/browser-worker.ts",
    strictCapability: "worker-init-option",
  },
  {
    runtime: "sqlite-wasm direct / OPFS",
    locator: "packages/mojidata-api-sqlite-wasm/lib/sqlite-wasm-runtime.ts",
    strictCapability: "factory-option",
  },
  {
    runtime: "sqlite-wasm browser worker",
    locator: "packages/mojidata-api-sqlite-wasm/lib/browser-worker.ts",
    strictCapability: "worker-init-option",
  },
  {
    runtime: "D1 library",
    locator: "packages/mojidata-api-d1/lib/d1-runtime.ts",
    strictCapability: "factory-option",
  },
  {
    runtime: "D1 deployed worker",
    locator: "packages/mojidata-api-d1-worker/src/index.ts",
    strictCapability: "deployment-default",
  },
]

async function main() {
  const observations = await Promise.all(cases.map(observe))
  const rejected = observations.filter(item =>
    item.outcome === "explicit-rejection"
  ).length
  const accepted = observations.filter(item => item.outcome === "accepted").length
  const failures = observations.filter(item =>
    item.outcome === "wrong-error" || item.outcome === "unexpected-accept"
  )
  const expectedRejections = cases.filter(item => item.expected.kind === "reject").length
  const expectedAccepts = cases.filter(item => item.expected.kind === "accept").length
  const deploymentGaps = deploymentBoundaries.filter(item =>
    item.strictCapability === "unavailable"
  )
  const passed = rejected === expectedRejections &&
    accepted === expectedAccepts &&
    failures.length === 0 &&
    deploymentGaps.length === 0

  console.log(JSON.stringify({
    schemaVersion: 1,
    purpose: "idsflow-s3-enforcement-and-evidence-table",
    timingIncluded: false,
    inputs: { s1Artifact, s2Artifact, phaseArtifact },
    registeredProfiles: profiles,
    claimTable: [
      {
        claim: "wrong-plan-materiality",
        scope: "constructed-whole-rooted-s1",
        grade: "validated",
        evidence: [s1Artifact, {
          kind: "runner",
          locator: "packages/mojidata-api-bench/benchmarks/evaluate-idsflow-mismatch-matrix.ts",
        }],
      },
      {
        claim: "abstract-and-production-preservation",
        scope: "complete-whole-rooted-tree-and-token-disjoint-bounded-production",
        grade: "verified+validated",
        evidence: [
          ...profiles.flatMap(profile => profile.evidence),
          s2Artifact,
        ],
      },
      {
        claim: "fail-closed-enforcement",
        scope: "createSqlApiDb-invalid-manifest-matrix-and-runtime-option-propagation",
        grade: "validated",
        evidence: [
          {
            kind: "test",
            locator: "packages/mojidata-api-better-sqlite3/tests/idsfind-fts5.test.ts",
          },
          {
            kind: "runner",
            locator: "packages/mojidata-api-bench/benchmarks/evaluate-idsflow-s3-enforcement.ts",
          },
          ...deploymentBoundaries,
        ],
      },
      {
        claim: "query-plan-overhead-observed",
        scope: "neutral-six-query-phase-run",
        grade: "measured",
        evidence: [phaseArtifact],
      },
    ],
    enforcement: {
      cases: cases.length,
      expectedAccepts,
      accepted,
      expectedRejections,
      explicitRejections: rejected,
      failures,
      observations,
    },
    deploymentBoundaries,
    deploymentGaps,
    gate: {
      name: "S3-enforcement",
      passed,
    },
  }, null, 2))
  if (!passed) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
