import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"

import Database from "better-sqlite3"

import { tokenArgs } from "@mandel59/idsdb-utils"
import {
  createIdsfind,
  ftsIdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core"
import { createBetterSqlite3ExecutorProvider } from "@mandel59/mojidata-api-better-sqlite3"

type Stratum = "selective" | "medium" | "broad"
type Family = "exact-context" | "minimal-skeleton" | "root-perturbed"

type Node = {
  token: string
  path: number[]
  children: Node[]
  serialization: string
}

type Candidate = {
  query: string
  queryTokenCount: number
  family: Family
  originUcs: string
  originIdsTokens: string
  repeatedSerialization: string
  resultCount?: number
  stratum?: Stratum
}

const repositoryRoot = resolve(__dirname, "../../..")
const defaultExclusions = [
  "packages/mojidata-api-bench/benchmarks/idsfind-index-cases.json",
  "packages/mojidata-api-bench/benchmarks/idsfind-index-pilot-cases.json",
  "packages/mojidata-api-bench/benchmarks/idsfind-equality-confirmatory-cases.json",
]

function parseInteger(value: string | undefined, name: string) {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer: ${value}`)
  }
  return parsed
}

function parseArgs(argv: string[]) {
  let basePath = "packages/idsdb-fts5/idsfind.db"
  let outputPath: string | undefined
  let seed = 20260813
  let screenPerFamily = 300
  let positiveCount = 48
  let negativeCount = 12
  const exclusionPaths: string[] = []
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--base":
        basePath = argv[++index]
        break
      case "--output":
        outputPath = argv[++index]
        break
      case "--seed":
        seed = parseInteger(argv[++index], "seed")
        break
      case "--screen-per-family":
        screenPerFamily = parseInteger(argv[++index], "screen-per-family")
        break
      case "--positive-count":
        positiveCount = parseInteger(argv[++index], "positive-count")
        break
      case "--negative-count":
        negativeCount = parseInteger(argv[++index], "negative-count")
        break
      case "--exclude":
        exclusionPaths.push(argv[++index])
        break
      default:
        throw new Error(`Unknown argument: ${argv[index]}`)
    }
  }
  if (!outputPath) throw new Error("--output is required")
  return {
    basePath: resolve(repositoryRoot, basePath),
    outputPath: resolve(repositoryRoot, outputPath),
    seed,
    screenPerFamily,
    positiveCount,
    negativeCount,
    exclusionPaths: (exclusionPaths.length === 0 ? defaultExclusions : exclusionPaths)
      .map(path => resolve(repositoryRoot, path)),
  }
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex")
}

function priority(seed: number, query: string) {
  return sha256(`${seed}\0${query}`)
}

function parseNode(tokens: string[], index: number, path: number[]): [Node, number] | undefined {
  if (index >= tokens.length) return undefined
  const token = tokens[index]
  const children: Node[] = []
  let next = index + 1
  for (let childIndex = 0; childIndex < (tokenArgs[token] ?? 0); childIndex++) {
    const parsed = parseNode(tokens, next, [...path, childIndex])
    if (!parsed) return undefined
    children.push(parsed[0])
    next = parsed[1]
  }
  return [{
    token,
    path,
    children,
    serialization: tokens.slice(index, next).join(" "),
  }, next]
}

function collectNodes(root: Node) {
  const nodes: Node[] = []
  const visit = (node: Node) => {
    nodes.push(node)
    node.children.forEach(visit)
  }
  visit(root)
  return nodes
}

function startsWithPath(path: readonly number[], prefix: readonly number[]) {
  return prefix.length <= path.length &&
    prefix.every((value, index) => path[index] === value)
}

function renderExact(node: Node, repeatedSerialization: string): string[] {
  if (node.serialization === repeatedSerialization) return ["x"]
  return [
    node.token,
    ...node.children.flatMap(child => renderExact(child, repeatedSerialization)),
  ]
}

function renderMinimal(
  node: Node,
  repeatedSerialization: string,
  repeatedPaths: readonly number[][],
): string[] {
  if (node.serialization === repeatedSerialization) return ["x"]
  if (!repeatedPaths.some(path => startsWithPath(path, node.path))) return ["？"]
  return [
    node.token,
    ...node.children.flatMap(child =>
      renderMinimal(child, repeatedSerialization, repeatedPaths)
    ),
  ]
}

const operatorsByArity = new Map<number, string[]>([
  [2, ["⿰", "⿱", "⿴", "⿵", "⿶", "⿷", "⿸", "⿹", "⿺", "⿻", "⿼", "⿽"]],
  [3, ["⿲", "⿳"]],
])

function perturbRoot(tokens: string[]) {
  const alternatives = operatorsByArity.get(tokenArgs[tokens[0]] ?? 0)
  if (!alternatives) return undefined
  const index = alternatives.indexOf(tokens[0])
  if (index < 0) return undefined
  return [alternatives[(index + 1) % alternatives.length], ...tokens.slice(1)]
}

function queryFrom(tokens: string[]) {
  return `§${tokens.join("")}§`
}

function addCandidate(
  map: Map<string, Candidate>,
  candidate: Candidate,
  excluded: Set<string>,
) {
  if (
    excluded.has(candidate.query) ||
    candidate.queryTokenCount > 32 ||
    [...candidate.query].filter(token => token === "x").length < 2
  ) return
  if (!map.has(candidate.query)) map.set(candidate.query, candidate)
}

function classify(resultCount: number, totalUcs: number): Stratum {
  const ratio = resultCount / totalUcs
  if (ratio < 0.001) return "selective"
  if (ratio < 0.05) return "medium"
  return "broad"
}

function loadExcludedQueries(paths: string[]) {
  const queries = new Set<string>()
  for (const path of paths) {
    const manifest = JSON.parse(readFileSync(path, "utf8")) as {
      cases?: { ids?: string[] }[]
    }
    for (const entry of manifest.cases ?? []) {
      for (const query of entry.ids ?? []) queries.add(query)
    }
  }
  return queries
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const excluded = loadExcludedQueries(options.exclusionPaths)
  const db = new Database(options.basePath, { readonly: true, fileMustExist: true })
  const rows = db.prepare(
    "SELECT UCS, IDS_tokens FROM idsfind ORDER BY UCS, rowid",
  ).all() as { UCS: string; IDS_tokens: string }[]
  const totalUcs = (db.prepare(
    "SELECT count(DISTINCT UCS) AS count FROM idsfind",
  ).get() as { count: number }).count
  db.close()

  const exactCandidates = new Map<string, Candidate>()
  const minimalCandidates = new Map<string, Candidate>()
  const negativeCandidates = new Map<string, Candidate>()
  let rejectedIncompleteOrForest = 0
  for (const row of rows) {
    const tokens = row.IDS_tokens.split(" ")
    const parsed = parseNode(tokens, 0, [])
    if (!parsed || parsed[1] !== tokens.length) {
      rejectedIncompleteOrForest++
      continue
    }
    const root = parsed[0]
    const groups = new Map<string, Node[]>()
    for (const node of collectNodes(root)) {
      const group = groups.get(node.serialization) ?? []
      group.push(node)
      groups.set(node.serialization, group)
    }
    for (const [serialization, nodes] of groups) {
      if (nodes.length < 2) continue
      const common = {
        originUcs: row.UCS,
        originIdsTokens: row.IDS_tokens,
        repeatedSerialization: serialization,
      }
      const exactTokens = renderExact(root, serialization)
      const minimalTokens = renderMinimal(
        root,
        serialization,
        nodes.map(node => node.path),
      )
      const exact: Candidate = {
        ...common,
        query: queryFrom(exactTokens),
        queryTokenCount: exactTokens.length,
        family: "exact-context",
      }
      const minimal: Candidate = {
        ...common,
        query: queryFrom(minimalTokens),
        queryTokenCount: minimalTokens.length,
        family: "minimal-skeleton",
      }
      addCandidate(exactCandidates, exact, excluded)
      addCandidate(minimalCandidates, minimal, excluded)
      for (const tokensToPerturb of [exactTokens, minimalTokens]) {
        const perturbed = perturbRoot(tokensToPerturb)
        if (!perturbed) continue
        addCandidate(negativeCandidates, {
          ...common,
          query: queryFrom(perturbed),
          queryTokenCount: perturbed.length,
          family: "root-perturbed",
        }, excluded)
      }
    }
  }

  const takeForScreening = (candidates: Map<string, Candidate>) =>
    [...candidates.values()]
      .sort((left, right) =>
        priority(options.seed, left.query).localeCompare(
          priority(options.seed, right.query),
        )
      )
      .slice(0, options.screenPerFamily)
  const screening = [
    ...takeForScreening(exactCandidates),
    ...takeForScreening(minimalCandidates),
    ...takeForScreening(negativeCandidates),
  ].filter((candidate, index, all) =>
    all.findIndex(other => other.query === candidate.query) === index
  )

  const idsfind = createIdsfind(
    createBetterSqlite3ExecutorProvider(options.basePath),
    ftsIdsfindCandidateProvider,
  )
  let screeningErrors = 0
  let positiveOriginMismatches = 0
  for (const candidate of screening) {
    try {
      const results = await idsfind([candidate.query])
      candidate.resultCount = results.length
      candidate.stratum = classify(results.length, totalUcs)
      if (
        candidate.family !== "root-perturbed" &&
        !results.includes(candidate.originUcs)
      ) {
        positiveOriginMismatches++
        candidate.resultCount = undefined
        candidate.stratum = undefined
      }
    } catch {
      screeningErrors++
    }
  }

  const screenedPositive = screening.filter(candidate =>
    candidate.family !== "root-perturbed" &&
    candidate.resultCount !== undefined
  )
  const strata: Stratum[] = ["selective", "medium", "broad"]
  const baseQuota = Math.floor(options.positiveCount / strata.length)
  let remainder = options.positiveCount % strata.length
  const selected: Candidate[] = []
  const shortages: Partial<Record<Stratum, number>> = {}
  for (const stratum of strata) {
    const quota = baseQuota + (remainder-- > 0 ? 1 : 0)
    const available = screenedPositive
      .filter(candidate => candidate.stratum === stratum)
      .sort((left, right) =>
        priority(options.seed, left.query).localeCompare(
          priority(options.seed, right.query),
        )
      )
    selected.push(...available.slice(0, quota))
    if (available.length < quota) shortages[stratum] = quota - available.length
  }
  if (selected.length < options.positiveCount) {
    const selectedQueries = new Set(selected.map(candidate => candidate.query))
    selected.push(...screenedPositive
      .filter(candidate => !selectedQueries.has(candidate.query))
      .sort((left, right) =>
        priority(options.seed, left.query).localeCompare(
          priority(options.seed, right.query),
        )
      )
      .slice(0, options.positiveCount - selected.length))
  }
  const selectedNegative = screening
    .filter(candidate =>
      candidate.family === "root-perturbed" && candidate.resultCount === 0
    )
    .sort((left, right) =>
      priority(options.seed, left.query).localeCompare(
        priority(options.seed, right.query),
      )
    )
    .slice(0, options.negativeCount)
  selected.push(...selectedNegative)
  if (selected.length < 30) {
    throw new Error(`Only ${selected.length} holdout cases were selected`)
  }

  selected.sort((left, right) =>
    priority(options.seed, left.query).localeCompare(
      priority(options.seed, right.query),
    )
  )
  const manifest = {
    caseSetVersion: 2,
    stratification: {
      screeningDatabaseUcs: totalUcs,
      metric: "exact result count divided by distinct UCS count",
      selective: "[0, 0.001)",
      medium: "[0.001, 0.05)",
      broad: "[0.05, 1]",
      design:
        "Corpus-derived whole-anchored repeated-variable holdout; equality-index candidates and timings were not used for generation or selection",
    },
    generation: {
      generator: "derive-idsfind-equality-holdout.ts",
      seed: options.seed,
      basePath: options.basePath,
      baseSha256: sha256(readFileSync(options.basePath)),
      exclusionPaths: options.exclusionPaths,
      excludedQueryCount: excluded.size,
      screenPerFamily: options.screenPerFamily,
      requestedPositiveCount: options.positiveCount,
      requestedNegativeCount: options.negativeCount,
      candidateCounts: {
        exactContext: exactCandidates.size,
        minimalSkeleton: minimalCandidates.size,
        rootPerturbed: negativeCandidates.size,
      },
      screenedCount: screening.length,
      screeningErrors,
      positiveOriginMismatches,
      rejectedIncompleteOrForest,
      stratumShortages: shortages,
      selectedPositiveCount: selected.length - selectedNegative.length,
      selectedNegativeCount: selectedNegative.length,
    },
    cases: selected.map((candidate, index) => ({
      name: `gh${String(index + 1).padStart(2, "0")}`,
      description:
        `${candidate.family} corpus-derived repeated-subtree query`,
      ids: [candidate.query],
      stratum: candidate.stratum,
      family: `equality-${candidate.family}`,
      screeningResultCount: candidate.resultCount,
      derivation: {
        originUcs: candidate.originUcs,
        originIdsTokens: candidate.originIdsTokens,
        repeatedSerialization: candidate.repeatedSerialization,
      },
    })),
  }
  writeFileSync(
    options.outputPath,
    JSON.stringify(manifest, null, 2) + "\n",
  )
  process.stdout.write(JSON.stringify({
    outputPath: options.outputPath,
    selectedCount: selected.length,
    selectedByStratum: Object.fromEntries(strata.map(stratum => [
      stratum,
      selected.filter(candidate => candidate.stratum === stratum).length,
    ])),
    selectedByFamily: Object.fromEntries(
      [...new Set(selected.map(candidate => candidate.family))].map(family => [
        family,
        selected.filter(candidate => candidate.family === family).length,
      ]),
    ),
    generation: manifest.generation,
  }, null, 2) + "\n")
}

main()
