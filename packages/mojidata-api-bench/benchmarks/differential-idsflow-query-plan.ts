import { spawnSync } from "node:child_process"

import {
  compileIdsQueryPlan,
  evaluateIdsFlowRecipe,
  tokenizeIDS,
  type IdsFlowReadResult,
  type IdsQueryPlan,
} from "@mandel59/idsdb-utils"

type OracleResponse = {
  version: number
  command?: string
  transforms?: IdsQueryPlan["transforms"]
  policy?: {
    expandOverlaid: boolean
    resolveMaterializedComponents: boolean
  }
  error?: string
}

type Case = {
  name: string
  outputKind: "records" | "decompose"
  expandZVariants: boolean
  normalizeKdpvRadicalVariants: boolean
}

const cases: Case[] = [
  {
    name: "records",
    outputKind: "records",
    expandZVariants: true,
    normalizeKdpvRadicalVariants: true,
  },
  ...[false, true].flatMap(expandZVariants =>
    [false, true].map(normalizeKdpvRadicalVariants => ({
      name: `decompose-z${Number(expandZVariants)}-radical${
        Number(normalizeKdpvRadicalVariants)
      }`,
      outputKind: "decompose" as const,
      expandZVariants,
      normalizeKdpvRadicalVariants,
    }))
  ),
]

const records: IdsFlowReadResult = {
  records: [
    {
      char: "明",
      IDS: "⿰日月",
      idsDataSource: "differential-fixture",
      irgSource: "G",
    },
  ],
}

function recipe(testCase: Case): unknown {
  const datasets: Record<string, unknown> = {
    input: { read: { kind: "fixture" } },
  }
  if (testCase.outputKind === "decompose") {
    datasets.output = {
      decompose: {
        input: "input",
        expand_z_variants: testCase.expandZVariants,
        normalize_kdpv_radical_variants:
          testCase.normalizeKdpvRadicalVariants,
      },
    }
  }
  return {
    version: 1,
    datasets,
    output: testCase.outputKind === "records" ? "input" : "output",
  }
}

const oraclePath = process.argv[2] ?? process.env.LEAN_IDSFLOW_ORACLE
if (!oraclePath) {
  throw new Error(
    "Usage: differential-idsflow-query-plan <path-to-ids_search_verify>",
  )
}

const requests = cases.map(testCase => ({
  version: 1,
  command: "derive-idsflow-query-plan",
  outputKind: testCase.outputKind,
  expandZVariants: testCase.expandZVariants,
  normalizeKdpvRadicalVariants: testCase.normalizeKdpvRadicalVariants,
}))
const input = requests.map(value => JSON.stringify(value)).join("\n") + "\n"
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

const mismatches: unknown[] = []
cases.forEach((testCase, index) => {
  const response = responses[index]
  if (response.error || !response.transforms || !response.policy) {
    mismatches.push({ name: testCase.name, oracleResponse: response })
    return
  }

  const evaluated = evaluateIdsFlowRecipe(recipe(testCase), () => records)
  if (
    JSON.stringify(evaluated.queryPlan.transforms) !==
      JSON.stringify(response.transforms)
  ) {
    mismatches.push({
      name: testCase.name,
      boundary: "derived-plan",
      lean: response.transforms,
      typescript: evaluated.queryPlan.transforms,
    })
  }

  const compiled = compileIdsQueryPlan(evaluated.queryPlan)
  const overlayOutput = compiled.transformTokens(tokenizeIDS("⿻日丨"))
  const expandsOverlaid = overlayOutput.some(tokens => tokens[0] === "&OL3;")
  const typescriptPolicy = {
    expandOverlaid: expandsOverlaid,
    resolveMaterializedComponents: compiled.resolveMaterializedComponents,
  }
  if (JSON.stringify(typescriptPolicy) !== JSON.stringify(response.policy)) {
    mismatches.push({
      name: testCase.name,
      boundary: "compiled-policy",
      lean: response.policy,
      typescript: typescriptPolicy,
    })
  }
})

const summary = {
  protocolVersion: 1,
  cases: cases.length,
  recordsCases: cases.filter(item => item.outputKind === "records").length,
  decomposeCases: cases.filter(item => item.outputKind === "decompose").length,
  mismatches: mismatches.length,
}
console.log(JSON.stringify(summary, null, 2))
if (mismatches.length > 0) {
  console.error(JSON.stringify(mismatches, null, 2))
  process.exitCode = 1
}
