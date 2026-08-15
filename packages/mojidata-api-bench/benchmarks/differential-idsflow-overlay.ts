import { spawnSync } from "node:child_process"

import { expandOverlaid, tokenizeIDS } from "@mandel59/idsdb-utils"

type PatternNode = {
  token: string
  children: PatternNode[]
}

type WireNode = {
  token: string
  arity: number
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
const line = leaf("丨")
const fire = leaf("火")
const wildcard = leaf("？")

const cases = [
  { name: "literal", pattern: sun },
  { name: "wildcard", pattern: wildcard },
  { name: "ordinary-binary", pattern: node("⿰", sun, moon) },
  { name: "ordinary-ternary", pattern: node("⿲", sun, moon, fire) },
  { name: "root-overlay", pattern: node("⿻", sun, line) },
  { name: "root-overlay-wildcard-left", pattern: node("⿻", wildcard, line) },
  { name: "root-overlay-wildcard-right", pattern: node("⿻", sun, wildcard) },
  {
    name: "nested-left-overlay",
    pattern: node("⿰", node("⿻", sun, line), moon),
  },
  {
    name: "nested-right-overlay",
    pattern: node("⿱", fire, node("⿻", sun, line)),
  },
  {
    name: "two-sibling-overlays",
    pattern: node("⿰", node("⿻", sun, line), node("⿻", moon, fire)),
  },
  {
    name: "overlay-containing-overlay",
    pattern: node("⿻", node("⿻", sun, line), moon),
  },
  {
    name: "overlay-with-two-overlay-children",
    pattern: node("⿻", node("⿻", sun, line), node("⿻", moon, fire)),
  },
  {
    name: "ternary-one-overlay",
    pattern: node("⿲", sun, node("⿻", moon, line), fire),
  },
  {
    name: "ternary-two-overlays",
    pattern: node("⿳", node("⿻", sun, line), moon, node("⿻", fire, line)),
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

function overlayCount(pattern: PatternNode): number {
  return Number(pattern.token === "⿻") +
    pattern.children.reduce((sum, child) => sum + overlayCount(child), 0)
}

function canonicalAlternatives(alternatives: string[][]): string[] {
  return alternatives.map(alternative => JSON.stringify(alternative)).sort()
}

const oraclePath = process.argv[2] ?? process.env.LEAN_IDSFLOW_ORACLE
if (!oraclePath) {
  throw new Error(
    "Usage: differential-idsflow-overlay <path-to-ids_search_verify>",
  )
}

const input = cases.map(testCase => JSON.stringify({
  version: 1,
  command: "expand-overlaid-pattern",
  nodes: wireNodes(testCase.pattern),
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

const mismatches: unknown[] = []
let totalAlternatives = 0
cases.forEach((testCase, index) => {
  const response = responses[index]
  if (response.error || !response.alternatives) {
    mismatches.push({ name: testCase.name, oracleResponse: response })
    return
  }
  const leanAlternatives = response.alternatives.map(alternative =>
    alternative.map(item => item.token)
  )
  const typescriptAlternatives = expandOverlaid(
    tokenizeIDS(tokens(testCase.pattern).join("")),
  ).map(alternative => [...alternative])
  const expectedCount = 2 ** overlayCount(testCase.pattern)
  totalAlternatives += leanAlternatives.length

  const leanCanonical = canonicalAlternatives(leanAlternatives)
  const typescriptCanonical = canonicalAlternatives(typescriptAlternatives)
  const leanUnique = new Set(leanCanonical).size
  const typescriptUnique = new Set(typescriptCanonical).size

  if (
    JSON.stringify(leanCanonical) !== JSON.stringify(typescriptCanonical)
    || leanAlternatives.length !== expectedCount
    || typescriptAlternatives.length !== expectedCount
    || leanUnique !== expectedCount
    || typescriptUnique !== expectedCount
  ) {
    mismatches.push({
      name: testCase.name,
      source: tokens(testCase.pattern),
      expectedCount,
      leanUnique,
      typescriptUnique,
      leanAlternatives,
      typescriptAlternatives,
    })
  }
})

const summary = {
  protocolVersion: 1,
  cases: cases.length,
  maxDepth: Math.max(...cases.map(item => depth(item.pattern))),
  maxOverlayOccurrences: Math.max(
    ...cases.map(item => overlayCount(item.pattern)),
  ),
  totalAlternatives,
  mismatches: mismatches.length,
}
console.log(JSON.stringify(summary, null, 2))
if (mismatches.length > 0) {
  console.error(JSON.stringify(mismatches, null, 2))
  process.exitCode = 1
}
