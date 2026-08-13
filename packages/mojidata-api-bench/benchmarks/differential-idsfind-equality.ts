import { spawnSync } from "node:child_process"

import { encodeIdsFtsEqualityFeature } from "@mandel59/idsdb-utils"
import { compileIdsfindStructuralPattern } from "@mandel59/mojidata-api-core"

type Shape =
  | { kind: "leaf" }
  | { kind: "node"; operator: string; children: Shape[] }

type ConcreteNode =
  | { kind: "leaf"; variable: string }
  | { kind: "node"; operator: string; children: ConcreteNode[] }

type OracleResponse = {
  version: number
  command: string
  pairs: { left: number[]; right: number[] }[]
  error?: string
}

const leaf = (): Shape => ({ kind: "leaf" })
const node = (operator: string, ...children: Shape[]): Shape => ({
  kind: "node",
  operator,
  children,
})

function shapes() {
  const out: Shape[] = [
    node("⿰", leaf(), leaf()),
    node("⿱", leaf(), leaf()),
    node("⿲", leaf(), leaf(), leaf()),
    node("⿳", leaf(), leaf(), leaf()),
  ]
  for (const root of ["⿰", "⿱"]) {
    for (const nested of ["⿰", "⿱"]) {
      out.push(node(root, node(nested, leaf(), leaf()), leaf()))
      out.push(node(root, leaf(), node(nested, leaf(), leaf())))
    }
  }
  return out
}

function leafCount(shape: Shape): number {
  return shape.kind === "leaf"
    ? 1
    : shape.children.reduce((sum, child) => sum + leafCount(child), 0)
}

function instantiate(shape: Shape, variables: string[]): ConcreteNode {
  let index = 0
  const visit = (current: Shape): ConcreteNode => {
    if (current.kind === "leaf") {
      return { kind: "leaf", variable: variables[index++] }
    }
    return {
      kind: "node",
      operator: current.operator,
      children: current.children.map(visit),
    }
  }
  return visit(shape)
}

function serialize(tree: ConcreteNode): string[] {
  return tree.kind === "leaf"
    ? [tree.variable]
    : [tree.operator, ...tree.children.flatMap(serialize)]
}

function variablePaths(tree: ConcreteNode) {
  const paths = new Map<string, number[][]>()
  const visit = (current: ConcreteNode, path: number[]) => {
    if (current.kind === "leaf") {
      const values = paths.get(current.variable) ?? []
      values.push(path)
      paths.set(current.variable, values)
      return
    }
    current.children.forEach((child, index) => visit(child, [...path, index]))
  }
  visit(tree, [])
  return [...paths].map(([name, values]) => ({ name, paths: values }))
}

function assignments(count: number) {
  return Array.from({ length: 2 ** count }, (_, value) =>
    Array.from({ length: count }, (__, index) =>
      (value & (1 << index)) === 0 ? "x" : "y"
    )
  )
}

function equalityTerms(pattern: string | undefined) {
  return [...new Set(pattern?.match(/mdf2q(?:r|[0-2]+)e(?:r|[0-2]+)/gu) ?? [])]
    .sort()
}

const oraclePath = process.argv[2] ?? process.env.LEAN_EQUALITY_ORACLE
if (!oraclePath) {
  throw new Error(
    "Usage: differential-idsfind-equality <path-to-ids_search_verify>",
  )
}

const cases = shapes().flatMap((shape, shapeIndex) =>
  assignments(leafCount(shape)).map((variables, assignmentIndex) => {
    const tree = instantiate(shape, variables)
    const groups = variablePaths(tree)
    return {
      name: `shape-${shapeIndex}-assignment-${assignmentIndex}`,
      tokens: ["§", ...serialize(tree), "§"],
      groups,
    }
  })
)

const input = cases.map(item => JSON.stringify({
  version: 1,
  command: "compile-equality",
  variables: item.groups,
})).join("\n") + "\n"

const oracle = spawnSync(oraclePath, ["--jsonl"], {
  input,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
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

const mismatches: unknown[] = []
cases.forEach((item, index) => {
  const response = responses[index]
  if (response.error) {
    mismatches.push({ name: item.name, oracleError: response.error })
    return
  }
  const leanTerms = [...new Set(response.pairs.map(pair =>
    encodeIdsFtsEqualityFeature(pair.left, pair.right)
  ))].sort()
  const typescriptTerms = equalityTerms(
    compileIdsfindStructuralPattern([[item.tokens]], ["equality"]),
  )
  if (JSON.stringify(leanTerms) !== JSON.stringify(typescriptTerms)) {
    mismatches.push({
      name: item.name,
      tokens: item.tokens,
      leanTerms,
      typescriptTerms,
    })
  }
})

const guardCases = [
  { name: "unanchored", tokens: ["⿰", "x", "x"] },
  { name: "missing-close-anchor", tokens: ["§", "⿰", "x", "x"] },
  { name: "incomplete-tree", tokens: ["§", "⿰", "x", "§"] },
  { name: "trailing-token", tokens: ["§", "⿰", "x", "x", "y", "§"] },
  { name: "repeated-literal", tokens: ["§", "⿰", "木", "木", "§"] },
  { name: "single-occurrences", tokens: ["§", "⿰", "x", "y", "§"] },
]
for (const guard of guardCases) {
  const terms = equalityTerms(
    compileIdsfindStructuralPattern([[guard.tokens]], ["equality"]),
  )
  if (terms.length > 0) {
    mismatches.push({ name: guard.name, unexpectedTerms: terms })
  }
}
const summary = {
  protocolVersion: 1,
  generatedCases: cases.length,
  shapeCount: shapes().length,
  maxDepth: 2,
  adapterGuardCases: guardCases.length,
  variableAlphabet: ["x", "y"],
  mismatches: mismatches.length,
}
console.log(JSON.stringify(summary, null, 2))
if (mismatches.length > 0) {
  console.error(JSON.stringify(mismatches.slice(0, 10), null, 2))
  process.exitCode = 1
}
