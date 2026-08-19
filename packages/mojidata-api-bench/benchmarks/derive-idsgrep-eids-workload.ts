import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import Database from "better-sqlite3"

import { tokenArgs } from "@mandel59/idsdb-utils"

type Family =
  | "fragment-exact"
  | "fragment-one-wildcard"
  | "root-exact"
  | "root-one-wildcard"
type Stratum = "selective" | "medium" | "broad"

type Node = {
  token: string
  children: Node[]
  serialization: string
}

type Candidate = {
  family: Family
  tree: string
  mojidataQuery: string[]
  idsgrepQuery: string
  originUcs: string
  originIdsTokens: string
  resultCount: number
  stratum?: Stratum
}

const repositoryRoot = resolve(__dirname, "../../..")
const families: Family[] = [
  "fragment-exact",
  "fragment-one-wildcard",
  "root-exact",
  "root-one-wildcard",
]
const strata: Stratum[] = ["selective", "medium", "broad"]
const noHitScalars = Array.from(
  { length: 64 },
  (_, index) => String.fromCodePoint(0x10fffd - index),
)

function parseNonNegativeInteger(value: string | undefined, name: string) {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer: ${value}`)
  }
  return parsed
}

function parseArgs(argv: string[]) {
  let basePath: string | undefined
  let outputPath: string | undefined
  let expectedCorpusSha256: string | undefined
  let seed = 20260819
  let positivePerFamily = 12
  let noHitPerFamily = 3
  const exclusionPaths: string[] = []
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--base":
        basePath = argv[++index]
        break
      case "--output":
        outputPath = argv[++index]
        break
      case "--expected-corpus-sha256":
        expectedCorpusSha256 = argv[++index]
        break
      case "--seed":
        seed = parseNonNegativeInteger(argv[++index], "seed")
        break
      case "--positive-per-family":
        positivePerFamily = parseNonNegativeInteger(
          argv[++index],
          "positive-per-family",
        )
        break
      case "--no-hit-per-family":
        noHitPerFamily = parseNonNegativeInteger(argv[++index], "no-hit-per-family")
        break
      case "--exclude":
        exclusionPaths.push(argv[++index])
        break
      default:
        throw new Error(`Unknown argument: ${argv[index]}`)
    }
  }
  if (!basePath) throw new Error("--base is required")
  if (!outputPath) throw new Error("--output is required")
  if (!expectedCorpusSha256) {
    throw new Error("--expected-corpus-sha256 is required")
  }
  if (positivePerFamily % strata.length !== 0) {
    throw new Error("--positive-per-family must be divisible by three")
  }
  return {
    basePath: resolve(repositoryRoot, basePath),
    outputPath: resolve(repositoryRoot, outputPath),
    expectedCorpusSha256,
    seed,
    positivePerFamily,
    noHitPerFamily,
    exclusionPaths: (exclusionPaths.length > 0
      ? exclusionPaths
      : [
        "packages/mojidata-api-bench/benchmarks/idsgrep-eids-cases.json",
        "packages/mojidata-api-bench/benchmarks/idsgrep-eids-diagnostic-cases.json",
      ]).map(path => resolve(repositoryRoot, path)),
  }
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex")
}

function priority(seed: number, candidate: Candidate) {
  return sha256(
    `${seed}\0${candidate.family}\0${JSON.stringify(candidate.mojidataQuery)}` +
      `\0${candidate.idsgrepQuery}`,
  )
}

function parseNode(tokens: string[], index: number): [Node, number] | undefined {
  if (index >= tokens.length) return undefined
  const token = tokens[index]
  const children: Node[] = []
  let next = index + 1
  for (let childIndex = 0; childIndex < (tokenArgs[token] ?? 0); childIndex++) {
    const parsed = parseNode(tokens, next)
    if (!parsed) return undefined
    children.push(parsed[0])
    next = parsed[1]
  }
  return [{ token, children, serialization: tokens.slice(index, next).join("") }, next]
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

function isComparableTree(node: Node): boolean {
  if (node.children.length === 0) return Array.from(node.token).length === 1
  return tokenArgs[node.token] === node.children.length &&
    node.children.every(isComparableTree)
}

function wildcardTrees(node: Node) {
  return node.children.map((_, wildcardIndex) =>
    node.token + node.children.map((child, index) =>
      index === wildcardIndex ? "？" : child.serialization
    ).join("")
  )
}

function queries(family: Family, tree: string) {
  const isRoot = family.startsWith("root-")
  const mojidataTree = tree.split("?").join("？")
  const idsgrepTree = tree.split("？").join("?")
  return {
    mojidataQuery: [isRoot ? `§${mojidataTree}§` : mojidataTree],
    idsgrepQuery: isRoot ? idsgrepTree : `...${idsgrepTree}`,
  }
}

function candidateKey(family: Family, tree: string) {
  return `${family}\0${tree}`
}

function loadExclusions(paths: string[]) {
  const mojidata = new Set<string>()
  const idsgrep = new Set<string>()
  const inputs = []
  for (const path of paths) {
    const bytes = readFileSync(path)
    const manifest = JSON.parse(bytes.toString("utf8")) as {
      cases?: { mojidataQuery?: string[]; idsgrepQuery?: string }[]
    }
    for (const item of manifest.cases ?? []) {
      if (item.mojidataQuery) mojidata.add(JSON.stringify(item.mojidataQuery))
      if (item.idsgrepQuery) idsgrep.add(item.idsgrepQuery)
    }
    inputs.push({ path, sha256: sha256(bytes) })
  }
  return { mojidata, idsgrep, inputs }
}

function classify(resultCount: number): Stratum {
  if (resultCount <= 10) return "selective"
  if (resultCount <= 100) return "medium"
  return "broad"
}

function corpusFingerprint(rows: readonly { UCS: string; IDS_tokens: string }[]) {
  const records = [...new Set(rows.map(row =>
    JSON.stringify([row.UCS, row.IDS_tokens.split(" ").join("")])
  ))].sort()
  return {
    entries: records.length,
    sha256: sha256(records.join("\n") + "\n"),
  }
}

function selectPositive(
  candidates: Candidate[],
  family: Family,
  count: number,
  seed: number,
) {
  const cellQuota = count / strata.length
  const selected: Candidate[] = []
  const selectedKeys = new Set<string>()
  const shortages: Partial<Record<Stratum, number>> = {}
  const sorted = candidates
    .filter(candidate => candidate.family === family)
    .sort((left, right) => priority(seed, left).localeCompare(priority(seed, right)))
  for (const stratum of strata) {
    const available = sorted.filter(candidate => candidate.stratum === stratum)
    const take = available.slice(0, cellQuota)
    take.forEach(candidate => selectedKeys.add(candidateKey(family, candidate.tree)))
    selected.push(...take)
    if (take.length < cellQuota) shortages[stratum] = cellQuota - take.length
  }
  const fill = sorted.filter(candidate =>
    !selectedKeys.has(candidateKey(family, candidate.tree))
  ).slice(0, count - selected.length)
  selected.push(...fill)
  if (selected.length !== count) {
    throw new Error(`${family} has only ${selected.length} positive candidates`)
  }
  return { selected, shortages }
}

function mutateFirstLiteral(tree: string, replacement: string) {
  const tokens = Array.from(tree)
  const index = tokens.findIndex(token => token !== "？" && tokenArgs[token] === undefined)
  if (index < 0) throw new Error(`query has no replaceable literal: ${tree}`)
  tokens[index] = replacement
  return tokens.join("")
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const exclusions = loadExclusions(options.exclusionPaths)
  const db = new Database(options.basePath, { readonly: true, fileMustExist: true })
  const semantics = db.prepare(
    "SELECT schema_version, semantics_mode, semantics_profile FROM idsfind_semantics",
  ).get() as Record<string, unknown> | undefined
  if (
    semantics?.schema_version !== 3 ||
    semantics.semantics_mode !== "registered" ||
    semantics.semantics_profile !== "idsflow-records@1"
  ) {
    throw new Error(`base must use registered idsflow-records@1: ${JSON.stringify(semantics)}`)
  }
  const rows = db.prepare(
    "SELECT UCS, IDS_tokens FROM idsfind ORDER BY UCS, rowid",
  ).all() as { UCS: string; IDS_tokens: string }[]
  db.close()
  const corpus = corpusFingerprint(rows)
  if (corpus.sha256 !== options.expectedCorpusSha256) {
    throw new Error(
      `corpus mismatch: expected ${options.expectedCorpusSha256}, got ${corpus.sha256}`,
    )
  }
  const totalUcs = new Set(rows.map(row => row.UCS)).size
  const candidates = new Map<string, Candidate>()
  const resultCounts = new Map<string, number>()
  const corpusLeafTokens = new Set<string>()
  let currentUcs: string | undefined
  let currentKeys = new Set<string>()
  let rejectedTrees = 0
  const flushUcs = () => {
    for (const key of currentKeys) resultCounts.set(key, (resultCounts.get(key) ?? 0) + 1)
    currentKeys = new Set()
  }
  const add = (family: Family, tree: string, row: typeof rows[number]) => {
    const query = queries(family, tree)
    if (
      exclusions.mojidata.has(JSON.stringify(query.mojidataQuery)) ||
      exclusions.idsgrep.has(query.idsgrepQuery)
    ) return
    const key = candidateKey(family, tree)
    if (!candidates.has(key)) {
      candidates.set(key, {
        family,
        tree,
        ...query,
        originUcs: row.UCS,
        originIdsTokens: row.IDS_tokens,
        resultCount: 0,
      })
    }
    currentKeys.add(key)
  }
  for (const row of rows) {
    if (row.UCS !== currentUcs) {
      if (currentUcs !== undefined) flushUcs()
      currentUcs = row.UCS
    }
    const tokens = row.IDS_tokens.split(" ")
    const parsed = parseNode(tokens, 0)
    if (!parsed || parsed[1] !== tokens.length || !isComparableTree(parsed[0])) {
      rejectedTrees++
      continue
    }
    const root = parsed[0]
    for (const node of collectNodes(root)) {
      if (node.children.length === 0) {
        corpusLeafTokens.add(node.token)
        continue
      }
      add("fragment-exact", node.serialization, row)
      wildcardTrees(node).forEach(tree => add("fragment-one-wildcard", tree, row))
    }
    if (root.children.length > 0) {
      add("root-exact", root.serialization, row)
      wildcardTrees(root).forEach(tree => add("root-one-wildcard", tree, row))
    }
  }
  if (currentUcs !== undefined) flushUcs()

  const classified = [...candidates.entries()].map(([key, candidate]) => {
    candidate.resultCount = resultCounts.get(key) ?? 0
    candidate.stratum = classify(candidate.resultCount)
    return candidate
  })
  const positive: Candidate[] = []
  const shortages: Partial<Record<Family, Partial<Record<Stratum, number>>>> = {}
  for (const family of families) {
    const selection = selectPositive(
      classified,
      family,
      options.positivePerFamily,
      options.seed,
    )
    positive.push(...selection.selected)
    if (Object.keys(selection.shortages).length > 0) shortages[family] = selection.shortages
  }

  const unusedNoHitScalars = noHitScalars.filter(token => !corpusLeafTokens.has(token))
  const noHit: Candidate[] = []
  let scalarIndex = 0
  for (const family of families) {
    const origins = positive
      .filter(candidate => candidate.family === family)
      .sort((left, right) => priority(options.seed + 1, left).localeCompare(
        priority(options.seed + 1, right),
      ))
    for (let index = 0; index < options.noHitPerFamily; index++) {
      const origin = origins[index]
      const replacement = unusedNoHitScalars[scalarIndex++]
      if (!origin || !replacement) throw new Error(`cannot derive no-hit for ${family}`)
      const tree = mutateFirstLiteral(origin.tree, replacement)
      const key = candidateKey(family, tree)
      if ((resultCounts.get(key) ?? 0) !== 0) {
        throw new Error(`derived no-hit exists in corpus: ${family} ${tree}`)
      }
      noHit.push({
        family,
        tree,
        ...queries(family, tree),
        originUcs: origin.originUcs,
        originIdsTokens: origin.originIdsTokens,
        resultCount: 0,
      })
    }
  }

  const selected = [...positive, ...noHit]
  const manifest = {
    caseSetVersion: 2,
    protocol: {
      timingBlind: true,
      seed: options.seed,
      corpus,
      baseSemantics: semantics,
      exclusions: exclusions.inputs,
      deduplication: "family plus canonical query tree; result counts use distinct UCS",
      selectivityThresholds: {
        selective: "1 <= distinct UCS resultCount <= 10",
        medium: "11 <= distinct UCS resultCount <= 100",
        broad: "101 <= distinct UCS resultCount",
        noHit: "resultCount = 0",
      },
      quotas: {
        positivePerFamily: options.positivePerFamily,
        requestedPositivePerFamilyStratum: options.positivePerFamily / strata.length,
        noHitPerFamily: options.noHitPerFamily,
      },
      shortageRule: "record deficient cells, then fill within the same family by seeded hash order before timing",
      shortages,
      rejectedNonComparableTrees: rejectedTrees,
      candidateInventory: Object.fromEntries(families.map(family => [
        family,
        Object.fromEntries(strata.map(stratum => [
          stratum,
          classified.filter(candidate =>
            candidate.family === family && candidate.stratum === stratum
          ).length,
        ])),
      ])),
      selectedInventory: {
        byFamily: Object.fromEntries(families.map(family => [
          family,
          selected.filter(candidate => candidate.family === family).length,
        ])),
        byStratum: Object.fromEntries([
          ...strata.map(stratum => [
            stratum,
            positive.filter(candidate => candidate.stratum === stratum).length,
          ]),
          ["no-hit", noHit.length],
        ]),
      },
    },
    cases: selected.map((candidate, index) => ({
      name: `${candidate.family}-${candidate.resultCount === 0 ? "no-hit" : candidate.stratum}-${String(index + 1).padStart(2, "0")}`,
      description: `${candidate.family}; timing-blind exact count ${candidate.resultCount}`,
      family: candidate.family,
      stratum: candidate.resultCount === 0 ? "no-hit" : candidate.stratum,
      expectedResultCount: candidate.resultCount,
      mojidataQuery: candidate.mojidataQuery,
      idsgrepQuery: candidate.idsgrepQuery,
      derivation: {
        originUcs: candidate.originUcs,
        originIdsTokens: candidate.originIdsTokens,
      },
    })),
  }
  writeFileSync(options.outputPath, JSON.stringify(manifest, null, 2) + "\n")
  console.log(JSON.stringify({
    output: options.outputPath,
    cases: selected.length,
    corpus,
    shortages,
    selectedInventory: manifest.protocol.selectedInventory,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
