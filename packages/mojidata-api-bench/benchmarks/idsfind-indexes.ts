import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

import {
  createBvecIdsfindCandidateProvider,
  createIdsfind,
  createStructuralFtsIdsfindCandidateProvider,
  ftsIdsfindCandidateProvider,
  type IdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"
import { createBetterSqlite3ExecutorProvider } from "@mandel59/mojidata-api-better-sqlite3"

import {
  collectBenchmarkEnvironment,
  formatMs,
  percentile,
  summarize,
  type BenchmarkSummary,
} from "./lib"

type IndexName = "fts5" | "bvec" | "fts5-f1" | "fts5-f2"
type TargetName = IndexName | "selector" | "intersection"

type BenchmarkCase = {
  name: string
  description: string
  ids: string[]
  stratum: "selective" | "medium" | "broad"
  family: string
}

type CaseManifest = {
  caseSetVersion: number
  stratification?: Record<string, unknown>
  cases: BenchmarkCase[]
}

type LoadedCaseManifest = CaseManifest & {
  manifestPath: string
  manifestSha256: string
}

type Options = {
  iterations: number
  warmupIterations: number
  seed: number
  outputPath?: string
  format: "table" | "json"
  caseNames: string[]
  manifestPath?: string
  includeHybrid: boolean
  structuralFtsPath?: string
  includeBvec: boolean
  embeddedCandidateTiming: boolean
}

type Samples = {
  candidateMs: number[]
  endToEndMs: number[]
  endToEndCandidateMs: number[]
  exactAndFetchMs: number[]
}

type Target = {
  name: TargetName
  getCandidates: (ids: string[]) => Promise<string[]>
  search: (ids: string[]) => Promise<{ results: string[]; candidateMs: number }>
}

type Task = {
  caseIndex: number
  targetName: TargetName
}

const require = createRequire(__filename)
const formatVersion = 1

function parseIntegerOption(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(name + " must be a non-negative integer, got: " + value)
  }
  return parsed
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    iterations: parseIntegerOption(process.env.MOJIDATA_BENCH_ITERATIONS, 20, "iterations"),
    warmupIterations: parseIntegerOption(process.env.MOJIDATA_BENCH_WARMUP, 3, "warmup"),
    seed: parseIntegerOption(process.env.MOJIDATA_BENCH_SEED, 1, "seed"),
    outputPath: process.env.MOJIDATA_API_BENCH_OUTPUT,
    format: process.env.MOJIDATA_BENCH_FORMAT === "json" ? "json" : "table",
    caseNames: [],
    manifestPath: process.env.MOJIDATA_BENCH_MANIFEST,
    includeHybrid: false,
    structuralFtsPath: process.env.MOJIDATA_BENCH_STRUCTURAL_FTS,
    includeBvec: true,
    embeddedCandidateTiming: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--iterations":
        options.iterations = parseIntegerOption(argv[++index], options.iterations, "iterations")
        break
      case "--warmup":
        options.warmupIterations = parseIntegerOption(
          argv[++index],
          options.warmupIterations,
          "warmup",
        )
        break
      case "--seed":
        options.seed = parseIntegerOption(argv[++index], options.seed, "seed")
        break
      case "--output":
        options.outputPath = argv[++index]
        break
      case "--format": {
        const format = argv[++index]
        if (format !== "table" && format !== "json") {
          throw new Error('format must be "table" or "json", got: ' + format)
        }
        options.format = format
        break
      }
      case "--case": {
        const name = argv[++index]
        if (!name) throw new Error("--case requires a value")
        options.caseNames.push(name)
        break
      }
      case "--manifest":
        options.manifestPath = argv[++index]
        if (!options.manifestPath) throw new Error("--manifest requires a value")
        break
      case "--include-hybrid":
        options.includeHybrid = true
        break
      case "--structural-fts":
        options.structuralFtsPath = argv[++index]
        if (!options.structuralFtsPath) {
          throw new Error("--structural-fts requires a value")
        }
        break
      case "--no-bvec":
        options.includeBvec = false
        break
      case "--embedded-candidate-timing":
        options.embeddedCandidateTiming = true
        break
      case "--help":
      case "-h":
        printHelp()
        process.exit(0)
      default:
        throw new Error("Unknown argument: " + arg)
    }
  }

  if (options.iterations === 0) {
    throw new Error("iterations must be greater than 0")
  }
  if (options.includeHybrid && !options.includeBvec) {
    throw new Error("--include-hybrid requires BV128")
  }
  return options
}

function loadCases(names: string[], requestedPath?: string): LoadedCaseManifest {
  const manifestPath = requestedPath
    ? resolve(process.cwd(), requestedPath)
    : resolve(__dirname, "idsfind-index-cases.json")
  const bytes = readFileSync(manifestPath)
  const manifest = JSON.parse(bytes.toString("utf8")) as CaseManifest
  const loaded = {
    ...manifest,
    manifestPath,
    manifestSha256: createHash("sha256").update(bytes).digest("hex"),
  }
  if (names.length === 0) return loaded
  return {
    ...loaded,
    cases: names.map((name) => {
      const found = manifest.cases.find((entry) => entry.name === name)
      if (!found) {
        throw new Error(
          "Unknown case: " + name + "\nAvailable cases: " +
            manifest.cases.map((entry) => entry.name).join(", "),
        )
      }
      return found
    }),
  }
}

function printHelp() {
  const { cases } = loadCases([])
  const lines = [
    "Usage: yarn bench:idsfind-indexes [options]",
    "",
    "Options:",
    "  --iterations <n>      Measured iterations per case and index (default: 20)",
    "  --warmup <n>          Warmup iterations per case and index (default: 3)",
    "  --seed <n>            Deterministic task-order seed (default: 1)",
    "  --output <path>       Write machine-readable JSON results",
    "  --format <table|json> Console output format (default: table)",
    "  --case <name>         Run only the named case (repeatable)",
    "  --manifest <path>     Use an alternate versioned case manifest",
    "  --include-hybrid      Add whole-anchor selector and candidate intersection",
    "  --structural-fts <db> Add F1 root and F2 edge targets from a derived DB",
    "  --no-bvec             Omit BV128 from this run",
    "  --embedded-candidate-timing",
    "                        Derive candidate timing from each end-to-end search",
    "  --help                Show this help",
    "",
    "Cases:",
    ...cases.map((entry) => "  - " + entry.name + ": " + entry.description),
  ]
  console.log(lines.join("\n"))
}

function hashFile(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function readCommand(command: string, args: string[]) {
  try {
    return execFileSync(command, args, {
      cwd: resolve(__dirname, "../../.."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
  }
}

function createPrng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

function shuffle<T>(values: T[], random: () => number) {
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temporary = values[index]
    values[index] = values[swapIndex]
    values[swapIndex] = temporary
  }
  return values
}

function makeTasks(
  caseCount: number,
  repetitions: number,
  targetNames: TargetName[],
): Task[] {
  const tasks: Task[] = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (let caseIndex = 0; caseIndex < caseCount; caseIndex++) {
      for (const targetName of targetNames) {
        tasks.push({ caseIndex, targetName })
      }
    }
  }
  return tasks
}

async function createTarget(
  name: TargetName,
  dbPath: string,
  provider: IdsfindCandidateProvider,
): Promise<Target> {
  const getDb = createBetterSqlite3ExecutorProvider(dbPath)
  let lastCandidateMs = Number.NaN
  const timedProvider: IdsfindCandidateProvider = {
    async getCandidates(db, idslist) {
      const startedAt = performance.now()
      const candidates = await provider.getCandidates(db, idslist)
      lastCandidateMs = performance.now() - startedAt
      return candidates
    },
  }
  const idsfind = createIdsfind(getDb, timedProvider)
  return {
    name,
    async getCandidates(ids) {
      return provider.getCandidates(await getDb(), tokenizeIdsList(ids).forQuery)
    },
    async search(ids) {
      lastCandidateMs = Number.NaN
      const results = await idsfind(ids)
      if (!Number.isFinite(lastCandidateMs)) {
        throw new Error(name + " candidate timing was not recorded")
      }
      return { results, candidateMs: lastCandidateMs }
    },
  }
}

function createWholeAnchorSelector(fts5: Target, bvec: Target): Target {
  const select = (ids: string[]) =>
    ids.length === 1 && ids[0].startsWith("§") && ids[0].endsWith("§")
      ? bvec
      : fts5
  return {
    name: "selector",
    getCandidates(ids) {
      return select(ids).getCandidates(ids)
    },
    search(ids) {
      return select(ids).search(ids)
    },
  }
}

async function createIntersectionTarget(
  fts5Path: string,
  bvecPath: string,
): Promise<Target> {
  const fts5Db = createBetterSqlite3ExecutorProvider(fts5Path)
  const bvecDb = createBetterSqlite3ExecutorProvider(bvecPath)
  const bvecProvider = createBvecIdsfindCandidateProvider()
  let lastCandidateMs = Number.NaN
  const provider: IdsfindCandidateProvider = {
    async getCandidates(_db, idslist) {
      const startedAt = performance.now()
      const [fts5Candidates, bvecCandidates] = await Promise.all([
        ftsIdsfindCandidateProvider.getCandidates(await fts5Db(), idslist),
        bvecProvider.getCandidates(await bvecDb(), idslist),
      ])
      const bvecSet = new Set(bvecCandidates)
      const candidates = fts5Candidates.filter((ucs) => bvecSet.has(ucs))
      lastCandidateMs = performance.now() - startedAt
      return candidates
    },
  }
  const idsfind = createIdsfind(fts5Db, provider)
  return {
    name: "intersection",
    async getCandidates(ids) {
      return provider.getCandidates(await fts5Db(), tokenizeIdsList(ids).forQuery)
    },
    async search(ids) {
      lastCandidateMs = Number.NaN
      const results = await idsfind(ids)
      if (!Number.isFinite(lastCandidateMs)) {
        throw new Error("intersection candidate timing was not recorded")
      }
      return { results, candidateMs: lastCandidateMs }
    },
  }
}

function sameSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

function createEmptySamples(): Samples {
  return {
    candidateMs: [],
    endToEndMs: [],
    endToEndCandidateMs: [],
    exactAndFetchMs: [],
  }
}

function seedFrom(base: number, value: string) {
  let seed = base >>> 0
  for (const character of value) {
    seed = Math.imul(seed ^ character.codePointAt(0)!, 16777619) >>> 0
  }
  return seed
}

function bootstrapMedian95(samplesMs: number[], seed: number) {
  const resamples = 2_000
  const random = createPrng(seed)
  const medians: number[] = []
  for (let repetition = 0; repetition < resamples; repetition++) {
    const sample: number[] = []
    for (let index = 0; index < samplesMs.length; index++) {
      sample.push(samplesMs[Math.floor(random() * samplesMs.length)])
    }
    medians.push(summarize(sample).p50Ms)
  }
  medians.sort((left, right) => left - right)
  return {
    lowMs: percentile(medians, 0.025),
    highMs: percentile(medians, 0.975),
    resamples,
  }
}

function phase(samplesMs: number[], seed: number): {
  samplesMs: number[]
  summary: BenchmarkSummary
  p50Ci95: ReturnType<typeof bootstrapMedian95>
} {
  return {
    samplesMs,
    summary: summarize(samplesMs),
    p50Ci95: bootstrapMedian95(samplesMs, seed),
  }
}

function createPayload(
  manifest: LoadedCaseManifest,
  cases: BenchmarkCase[],
  options: Options,
  paths: Record<string, string>,
  targetNames: TargetName[],
  counts: Map<string, { candidateCount: number; resultCount: number }>,
  samples: Map<string, Samples>,
) {
  const measurement = (caseName: string, targetName: TargetName) => {
    const key = caseName + ":" + targetName
    const values = samples.get(key)
    const count = counts.get(key)
    if (!values || !count) throw new Error("Missing measurement for " + key)
    const phaseSeed = (name: string) =>
      seedFrom(options.seed, key + ":" + name)
    return {
      candidateCount: count.candidateCount,
      candidate: phase(values.candidateMs, phaseSeed("candidate")),
      endToEnd: phase(values.endToEndMs, phaseSeed("endToEnd")),
      endToEndCandidate: phase(
        values.endToEndCandidateMs,
        phaseSeed("endToEndCandidate"),
      ),
      exactAndFetch: phase(values.exactAndFetchMs, phaseSeed("exactAndFetch")),
    }
  }

  return {
    formatVersion,
    caseSetVersion: manifest.caseSetVersion,
    caseManifest: {
      path: manifest.manifestPath,
      sha256: manifest.manifestSha256,
      stratification: manifest.stratification,
    },
    iterations: options.iterations,
    warmupIterations: options.warmupIterations,
    seed: options.seed,
    candidateTiming: options.embeddedCandidateTiming ? "embedded" : "standalone-and-embedded",
    environment: collectBenchmarkEnvironment(),
    revision: {
      jjCommitId: readCommand("jj", ["log", "-r", "@-", "--no-graph", "-T", "commit_id"]),
      jjChangeId: readCommand("jj", ["log", "-r", "@-", "--no-graph", "-T", "change_id"]),
      jjWorkingCopySummary: readCommand("jj", ["diff", "--summary"]),
    },
    databases: Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [
        name,
        {
          path,
          bytes: statSync(path).size,
          sha256: hashFile(path),
        },
      ]),
    ),
    selectedCases: cases.map((entry) => entry.name),
    results: cases.map((entry) => ({
      ...entry,
      resultCount: counts.get(entry.name + ":fts5")?.resultCount ?? 0,
      sameResults: true,
      indexes: Object.fromEntries(
        targetNames.map((name) => [name, measurement(entry.name, name)]),
      ) as Record<TargetName, ReturnType<typeof measurement>>,
    })),
  }
}

function printTable(
  result: ReturnType<typeof createPayload>,
  targetNames: TargetName[],
) {
  const lines = [
    "idsfind FTS5 vs BV128",
    "Runtime: " + result.environment.nodeVersion + " " + result.environment.platform +
      "-" + result.environment.arch,
    "Revision: " +
      (result.revision.jjCommitId ?? result.environment.gitRevision ?? "unknown"),
    "Iterations: " + result.iterations + ", warmup: " + result.warmupIterations +
      ", seed: " + result.seed,
    "",
    "| Case | Index | Candidates | Results | Candidate p50 | End-to-end p50 | Exact/fetch p50 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const entry of result.results) {
    for (const target of targetNames) {
      const measurement = entry.indexes[target]
      lines.push(
        "| " + entry.name + " | " + target + " | " + measurement.candidateCount +
          " | " + entry.resultCount + " | " +
          formatMs(measurement.candidate.summary.p50Ms) + " | " +
          formatMs(measurement.endToEnd.summary.p50Ms) + " | " +
          formatMs(measurement.exactAndFetch.summary.p50Ms) + " |",
      )
    }
  }
  process.stdout.write(lines.join("\n") + "\n")
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifest = loadCases(
    options.caseNames,
    options.manifestPath,
  )
  const { cases } = manifest
  const paths: Record<string, string> = {
    fts5: require.resolve("@mandel59/idsdb-fts5/idsfind.db"),
    bvec: require.resolve("@mandel59/idsdb-bvec/idsfind.db"),
  }
  const targets = {
    fts5: await createTarget("fts5", paths.fts5, ftsIdsfindCandidateProvider),
    bvec: await createTarget("bvec", paths.bvec, createBvecIdsfindCandidateProvider()),
  } as Record<TargetName, Target>
  const targetNames: TargetName[] = ["fts5"]
  if (options.includeBvec) targetNames.push("bvec")
  if (options.structuralFtsPath) {
    const structuralPath = resolve(__dirname, "../../..", options.structuralFtsPath)
    paths.structuralFts = structuralPath
    targets["fts5-f1"] = await createTarget(
      "fts5-f1",
      structuralPath,
      createStructuralFtsIdsfindCandidateProvider(["root"]),
    )
    targets["fts5-f2"] = await createTarget(
      "fts5-f2",
      structuralPath,
      createStructuralFtsIdsfindCandidateProvider(["root", "edge"]),
    )
    targetNames.push("fts5-f1", "fts5-f2")
  }
  if (options.includeHybrid) {
    targets.selector = createWholeAnchorSelector(targets.fts5, targets.bvec)
    targets.intersection = await createIntersectionTarget(paths.fts5, paths.bvec)
    targetNames.push("selector", "intersection")
  }
  const counts = new Map<string, { candidateCount: number; resultCount: number }>()
  const samples = new Map<string, Samples>()

  for (const benchmarkCase of cases) {
    const observations = await Promise.all(targetNames.map(async (targetName) => ({
      targetName,
      candidates: await targets[targetName].getCandidates(benchmarkCase.ids),
      results: await targets[targetName].search(benchmarkCase.ids),
    })))
    const expected = observations[0].results.results
    for (const observation of observations) {
      if (!sameSet(expected, observation.results.results)) {
        throw new Error(
          "Result mismatch for " + benchmarkCase.name + ":" + observation.targetName,
        )
      }
      counts.set(benchmarkCase.name + ":" + observation.targetName, {
        candidateCount: observation.candidates.length,
        resultCount: observation.results.results.length,
      })
      samples.set(
        benchmarkCase.name + ":" + observation.targetName,
        createEmptySamples(),
      )
    }
  }

  const random = createPrng(options.seed)
  for (const task of shuffle(
    makeTasks(cases.length, options.warmupIterations, targetNames),
    random,
  )) {
    const benchmarkCase = cases[task.caseIndex]
    const target = targets[task.targetName]
    if (!options.embeddedCandidateTiming) {
      await target.getCandidates(benchmarkCase.ids)
    }
    await target.search(benchmarkCase.ids)
  }

  for (const task of shuffle(
    makeTasks(cases.length, options.iterations, targetNames),
    random,
  )) {
    const benchmarkCase = cases[task.caseIndex]
    const target = targets[task.targetName]
    const values = samples.get(benchmarkCase.name + ":" + target.name)
    if (!values) throw new Error("Missing sample accumulator")

    if (!options.embeddedCandidateTiming) {
      const candidateStartedAt = performance.now()
      await target.getCandidates(benchmarkCase.ids)
      values.candidateMs.push(performance.now() - candidateStartedAt)
    }

    const startedAt = performance.now()
    const search = await target.search(benchmarkCase.ids)
    const endToEndMs = performance.now() - startedAt
    values.endToEndMs.push(endToEndMs)
    values.endToEndCandidateMs.push(search.candidateMs)
    if (options.embeddedCandidateTiming) {
      values.candidateMs.push(search.candidateMs)
    }
    values.exactAndFetchMs.push(Math.max(0, endToEndMs - search.candidateMs))
  }

  const result = createPayload(
    manifest,
    cases,
    options,
    paths,
    targetNames,
    counts,
    samples,
  )
  if (options.outputPath) {
    const outputPath = resolve(process.cwd(), options.outputPath)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, JSON.stringify(result, null, 2))
  }
  if (options.format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n")
  } else {
    printTable(result, targetNames)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
