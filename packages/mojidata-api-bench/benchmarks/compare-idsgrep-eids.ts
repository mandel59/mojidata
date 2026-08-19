import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import os from "node:os"
import { resolve } from "node:path"
import { performance } from "node:perf_hooks"
import Database from "better-sqlite3"

import {
  createBvecIdsfindCandidateProvider,
  createIdsfind,
  ftsIdsfindCandidateProvider,
  type IdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core"
import { createBetterSqlite3ExecutorProvider } from "@mandel59/mojidata-api-better-sqlite3"
import {
  convertEidsDictionary,
  projectEidsParityCorpus,
} from "@mandel59/idsflow-eids"

type BenchmarkCase = {
  name: string
  description: string
  mojidataQuery: string[]
  idsgrepQuery: string
  expectedResultCount?: number
}

type Options = {
  idsgrepPath: string
  eidsPath: string
  fts4Path: string
  fts5Path: string
  bvecPath: string
  manifestPath: string
  workDirectory: string
  mojidataCliPath: string
  outputPath?: string
  iterations: number
  warmup: number
  seed: number
}

type Target = {
  name: string
  search: (item: BenchmarkCase) => Promise<string[]>
  timedSearch: (item: BenchmarkCase) => Promise<void>
}

const exactScanCandidateProvider: IdsfindCandidateProvider = {
  async getCandidates(db) {
    const rows = await db.query<{ UCS?: unknown }>(
      "SELECT DISTINCT UCS FROM idsfind",
    )
    return rows.flatMap(row => typeof row.UCS === "string" ? [row.UCS] : [])
  },
}

function parseCount(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

function parseArgs(argv: string[]): Options {
  if (argv[0] === "--") argv = argv.slice(1)
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("arguments must be --name value pairs")
    }
    values.set(name, value)
  }
  const required = (name: string) => {
    const value = values.get(name)
    if (!value) throw new Error(`${name} is required`)
    return resolve(value)
  }
  return {
    idsgrepPath: required("--idsgrep"),
    eidsPath: required("--eids"),
    fts4Path: required("--fts4"),
    fts5Path: required("--fts5"),
    bvecPath: required("--bvec"),
    workDirectory: required("--work-dir"),
    mojidataCliPath: values.get("--mojidata-cli")
      ? resolve(values.get("--mojidata-cli") as string)
      : resolve(__dirname, "mojidata-query.cjs"),
    manifestPath: values.get("--manifest")
      ? resolve(values.get("--manifest") as string)
      : resolve(__dirname, "idsgrep-eids-cases.json"),
    outputPath: values.get("--output")
      ? resolve(values.get("--output") as string)
      : undefined,
    iterations: parseCount(values.get("--iterations"), 30, "iterations"),
    warmup: parseCount(values.get("--warmup"), 5, "warmup"),
    seed: parseCount(values.get("--seed"), 1, "seed"),
  }
}

function hashFile(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function sortedSet(values: Iterable<string>) {
  return [...new Set(values)].sort()
}

function difference(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right)
  return left.filter(value => !rightSet.has(value))
}

type CorpusEntry = {
  UCS: string
  IDS: string
}

function summarizeCorpus(entries: Iterable<CorpusEntry>) {
  const records = sortedSet(
    Array.from(entries, entry => JSON.stringify([entry.UCS, entry.IDS])),
  )
  return {
    entries: records.length,
    sha256: createHash("sha256").update(records.join("\n") + "\n").digest("hex"),
  }
}

function summarizeDatabaseCorpus(path: string) {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  try {
    const semantics = db.prepare(
      "SELECT schema_version, semantics_mode, semantics_profile " +
      "FROM idsfind_semantics",
    ).get() as {
      schema_version?: unknown
      semantics_mode?: unknown
      semantics_profile?: unknown
    } | undefined
    if (
      semantics?.schema_version !== 3 ||
      semantics.semantics_mode !== "registered" ||
      semantics.semantics_profile !== "idsflow-records@1"
    ) {
      throw new Error(
        "database must use registered idsflow-records@1 semantics: " +
        path + " " + JSON.stringify(semantics),
      )
    }
    return summarizeCorpus(db.prepare(
      "SELECT UCS, replace(IDS_tokens, ' ', '') AS IDS FROM idsfind",
    ).iterate() as Iterable<CorpusEntry>)
  } finally {
    db.close()
  }
}

function requireMatchingCorpus(
  expected: ReturnType<typeof summarizeCorpus>,
  actual: ReturnType<typeof summarizeCorpus>,
  name: string,
) {
  if (actual.entries !== expected.entries || actual.sha256 !== expected.sha256) {
    throw new Error(
      name + " database corpus does not match the projected EIDS corpus: " +
      JSON.stringify({ expected, actual }),
    )
  }
}

function percentile(sorted: readonly number[], fraction: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  }
}

function createIdsTarget(
  name: string,
  dbPath: string,
  provider: IdsfindCandidateProvider,
): Target {
  const search = createIdsfind(createBetterSqlite3ExecutorProvider(dbPath), provider)
  return {
    name,
    async search(item) {
      return sortedSet(await search(item.mojidataQuery))
    },
    async timedSearch(item) {
      await search(item.mojidataQuery)
    },
  }
}

function runMojidataFreshProcess(
  options: Options,
  dbPath: string,
  provider: "fts" | "bvec",
  item: BenchmarkCase,
  captureOutput: boolean,
) {
  return execFileSync(process.execPath, [
    options.mojidataCliPath,
    "--db", dbPath,
    "--provider", provider,
    "--query-json", JSON.stringify(item.mojidataQuery),
  ], captureOutput
    ? { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }
    : { stdio: ["ignore", "ignore", "pipe"] })
}

function createMojidataFreshProcessTarget(
  name: string,
  options: Options,
  dbPath: string,
  provider: "fts" | "bvec",
): Target {
  return {
    name,
    async search(item) {
      const output = runMojidataFreshProcess(
        options,
        dbPath,
        provider,
        item,
        true,
      )
      const parsed = JSON.parse(output as string) as unknown
      if (!Array.isArray(parsed) || parsed.some(value => typeof value !== "string")) {
        throw new Error(`${name} did not emit a string array`)
      }
      return sortedSet(parsed as string[])
    },
    async timedSearch(item) {
      runMojidataFreshProcess(options, dbPath, provider, item, false)
    },
  }
}

function runIdsGrep(options: Options, item: BenchmarkCase, ignoreIndex: boolean) {
  const args = [
    "--color=never",
    "-c", "cooked",
    ...(ignoreIndex ? ["-I"] : []),
    item.idsgrepQuery,
    options.eidsPath,
  ]
  return execFileSync(options.idsgrepPath, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  })
}

function createIdsGrepTarget(
  name: string,
  options: Options,
  ignoreIndex: boolean,
): Target {
  return {
    name,
    async search(item) {
      const converted = convertEidsDictionary(runIdsGrep(options, item, ignoreIndex))
      return sortedSet(converted.entries.map(entry => entry.UCS))
    },
    async timedSearch(item) {
      execFileSync(options.idsgrepPath, [
        "--color=never",
        "-c", "cooked",
        ...(ignoreIndex ? ["-I"] : []),
        item.idsgrepQuery,
        options.eidsPath,
      ], { stdio: ["ignore", "ignore", "pipe"] })
    },
  }
}

function idsGrepStatistics(options: Options, item: BenchmarkCase) {
  const output = execFileSync(options.idsgrepPath, [
    "--color=never",
    "-c", "cooked",
    "--statistics",
    item.idsgrepQuery,
    options.eidsPath,
  ], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  })
  const lines = output.trimEnd().split("\n")
  const line = lines[lines.length - 1]
  const fields = line?.split(" ")
  if (!fields || fields[0] !== "STATS" || fields.length < 12) {
    throw new Error("IDSgrep did not emit a valid STATS line")
  }
  return {
    bitVectorChecks: Number(fields[1]),
    lambdaFilterHits: Number(fields[2]),
    bddHits: Number(fields[3]),
    treeChecks: Number(fields[4]),
    treeHits: Number(fields[5]),
    memoizationChecks: Number(fields[6]),
    memoizationHits: Number(fields[7]),
    userCpuSeconds: Number(fields[8]),
  }
}

function shuffled<T>(values: T[], seed = 1) {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[values[index], values[other]] = [values[other], values[index]]
  }
  return values
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sourceEidsPath = options.eidsPath
  const sourceEids = readFileSync(sourceEidsPath, "utf8")
  const parityProjection = projectEidsParityCorpus(sourceEids)
  mkdirSync(options.workDirectory, { recursive: true })
  options.eidsPath = resolve(options.workDirectory, "parity.eids")
  writeFileSync(options.eidsPath, parityProjection.output)
  const idsgrepIndexPath = options.eidsPath.replace(/\.eids$/u, ".bvec")
  writeFileSync(
    idsgrepIndexPath,
    execFileSync(options.idsgrepPath, ["-G", options.eidsPath], {
      maxBuffer: 128 * 1024 * 1024,
    }),
  )
  const manifestBytes = readFileSync(options.manifestPath)
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    caseSetVersion: number
    cases: BenchmarkCase[]
  }
  const expectedCorpus = summarizeCorpus(
    convertEidsDictionary(parityProjection.output).entries,
  )
  const databaseCorpora = {
    fts4: summarizeDatabaseCorpus(options.fts4Path),
    fts5: summarizeDatabaseCorpus(options.fts5Path),
    bvec: summarizeDatabaseCorpus(options.bvecPath),
  }
  for (const [name, corpus] of Object.entries(databaseCorpora)) {
    requireMatchingCorpus(expectedCorpus, corpus, name)
  }
  const targets: Target[] = [
    createIdsGrepTarget("idsgrep-indexed", options, false),
    createIdsGrepTarget("idsgrep-scan", options, true),
    createIdsTarget("mojidata-fts4", options.fts4Path, ftsIdsfindCandidateProvider),
    createIdsTarget("mojidata-fts5", options.fts5Path, ftsIdsfindCandidateProvider),
    createIdsTarget("mojidata-bvec", options.bvecPath, createBvecIdsfindCandidateProvider()),
    createMojidataFreshProcessTarget(
      "mojidata-fts5-fresh-process",
      options,
      options.fts5Path,
      "fts",
    ),
    createMojidataFreshProcessTarget(
      "mojidata-bvec-fresh-process",
      options,
      options.bvecPath,
      "bvec",
    ),
  ]
  const oracle = createIdsTarget(
    "mojidata-exact-scan",
    options.fts5Path,
    exactScanCandidateProvider,
  )
  const correctnessTargets = [oracle, ...targets]

  const correctness = []
  for (const item of manifest.cases) {
    const results = Object.fromEntries(
      await Promise.all(
        correctnessTargets.map(async target => [target.name, await target.search(item)]),
      ),
    ) as Record<string, string[]>
    const expected = results[oracle.name]
    if (
      item.expectedResultCount !== undefined &&
      expected.length !== item.expectedResultCount
    ) {
      throw new Error(`${item.name}: frozen count ${item.expectedResultCount} does not match exact oracle ${expected.length}`)
    }
    correctness.push({
      name: item.name,
      idsgrepStatistics: idsGrepStatistics(options, item),
      resultCounts: Object.fromEntries(
        correctnessTargets.map(target => [target.name, results[target.name].length]),
      ),
      comparisons: Object.fromEntries(targets.map(target => {
        const actual = results[target.name]
        const missing = difference(expected, actual)
        const extra = difference(actual, expected)
        return [target.name, {
          equal: missing.length === 0 && extra.length === 0,
          missingCount: missing.length,
          extraCount: extra.length,
          missingExamples: missing.slice(0, 10),
          extraExamples: extra.slice(0, 10),
        }]
      })),
    })
  }

  for (let repetition = 0; repetition < options.warmup; repetition++) {
    for (const item of manifest.cases) {
      for (const target of targets) await target.timedSearch(item)
    }
  }

  const samples = new Map<string, number[]>()
  const measurements = []
  const tasks = []
  for (let repetition = 0; repetition < options.iterations; repetition++) {
    for (const item of manifest.cases) {
      for (const target of targets) tasks.push({ repetition, item, target })
    }
  }
  for (const { repetition, item, target } of shuffled(tasks, options.seed)) {
    const startedAt = performance.now()
    await target.timedSearch(item)
    const key = `${item.name}:${target.name}`
    const values = samples.get(key) ?? []
    const elapsedMs = performance.now() - startedAt
    values.push(elapsedMs)
    samples.set(key, values)
    measurements.push({
      sequence: measurements.length,
      repetition,
      case: item.name,
      target: target.name,
      elapsedMs,
    })
  }

  const payload = {
    formatVersion: 3,
    generatedAt: new Date().toISOString(),
    inputs: {
      sourceEids: {
        path: sourceEidsPath,
        sha256: hashFile(sourceEidsPath),
        bytes: statSync(sourceEidsPath).size,
      },
      idsgrep: {
        path: options.idsgrepPath,
        version: execFileSync(options.idsgrepPath, ["-V"], { encoding: "utf8" })
          .split("\n")[0],
        sha256: hashFile(options.idsgrepPath),
      },
      eids: {
        path: options.eidsPath,
        sha256: hashFile(options.eidsPath),
        bytes: statSync(options.eidsPath).size,
        entries: parityProjection.entries,
        skippedFromSource: parityProjection.skipped,
        removedStructuralHeads: parityProjection.removedStructuralHeads,
      },
      idsgrepIndex: existsSync(idsgrepIndexPath) ? {
        path: idsgrepIndexPath,
        sha256: hashFile(idsgrepIndexPath),
        bytes: statSync(idsgrepIndexPath).size,
      } : null,
      databases: Object.fromEntries([
        ["fts4", options.fts4Path],
        ["fts5", options.fts5Path],
        ["bvec", options.bvecPath],
      ].map(([name, path]) => [name, {
        path,
        sha256: hashFile(path),
        bytes: statSync(path).size,
        corpus: databaseCorpora[name as keyof typeof databaseCorpora],
      }])),
      expectedCorpus,
      manifest: {
        path: options.manifestPath,
        sha256: createHash("sha256").update(manifestBytes).digest("hex"),
        caseSetVersion: manifest.caseSetVersion,
      },
      mojidataCli: {
        path: options.mojidataCliPath,
        sha256: hashFile(options.mojidataCliPath),
        bytes: statSync(options.mojidataCliPath).size,
        executable: process.execPath,
      },
    },
    method: {
      iterations: options.iterations,
      warmup: options.warmup,
      seed: options.seed,
      idsgrepIndexedUsesSiblingBvec: true,
      idsgrepAndMojidataCorpusContract:
        "accepted ordinary IDS entries from the recorded parity EIDS projection",
      correctnessOracle:
        "Mojidata exact verifier with every stored root as a candidate",
      idsgrepTimingIncludesProcessStartup: true,
      mojidataFreshProcessTimingIncludes:
        "Node startup, PnP module loading, database open, candidate generation, exact verification, and result materialization",
      persistentTargets: ["mojidata-fts4", "mojidata-fts5", "mojidata-bvec"],
      freshProcessTargets: ["idsgrep-indexed", "idsgrep-scan", "mojidata-fts5-fresh-process", "mojidata-bvec-fresh-process"],
      rawMeasurements: "seeded execution order with zero-based source repetition",
      outputDuringTiming: "discarded after each engine materialized its result",
    },
    environment: {
      node: process.version,
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model,
      nodeOptions: process.env.NODE_OPTIONS ?? null,
    },
    measurements,
    cases: manifest.cases,
    correctness,
    performance: manifest.cases.map(item => ({
      name: item.name,
      targets: Object.fromEntries(targets.map(target => [
        target.name,
        summarize(samples.get(`${item.name}:${target.name}`) ?? []),
      ])),
    })),
  }
  const output = JSON.stringify(payload, null, 2) + "\n"
  if (options.outputPath) writeFileSync(options.outputPath, output)
  process.stdout.write(output)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
