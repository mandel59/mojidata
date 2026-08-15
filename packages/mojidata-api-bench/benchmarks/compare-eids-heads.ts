import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

import { dropEidsStructuralHeads } from "@mandel59/idsflow-eids"

import {
  collectBenchmarkEnvironment,
  summarize,
} from "./lib"

type BenchmarkCase = {
  name: string
  description: string
  idsgrepQuery: string
}

type Options = {
  idsgrepPath: string
  eidsPath: string
  manifestPath: string
  workDirectory: string
  outputPath: string
  iterations: number
  warmup: number
  seed: number
}

type Statistics = {
  bitVectorChecks: number
  lambdaFilterHits: number
  bddHits: number
  treeChecks: number
  treeHits: number
  memoizationChecks: number
  memoizationHits: number
  userCpuSeconds: number
}

function parseCount(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

function parseArgs(args: string[]): Options {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument: ${key ?? ""}`)
    }
    values.set(key, value)
  }
  const required = (key: string) => {
    const value = values.get(key)
    if (!value) throw new Error(`${key} is required`)
    return resolve(value)
  }
  return {
    idsgrepPath: required("--idsgrep"),
    eidsPath: required("--eids"),
    manifestPath: values.has("--manifest")
      ? required("--manifest")
      : resolve(__dirname, "idsgrep-eids-cases.json"),
    workDirectory: required("--work-directory"),
    outputPath: required("--output"),
    iterations: parseCount(values.get("--iterations"), 30, "iterations"),
    warmup: parseCount(values.get("--warmup"), 5, "warmup"),
    seed: parseCount(values.get("--seed"), 1, "seed"),
  }
}

function hashFile(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function statistics(idsgrepPath: string, eidsPath: string, query: string): Statistics {
  const output = execFileSync(idsgrepPath, [
    "--color=never",
    "-c",
    "cooked",
    "--statistics",
    query,
    eidsPath,
  ], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  })
  const lines = output.trimEnd().split("\n")
  const fields = lines[lines.length - 1]?.split(" ")
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

function timedSearch(idsgrepPath: string, eidsPath: string, query: string) {
  const startedAt = performance.now()
  execFileSync(idsgrepPath, [
    "--color=never",
    "-c",
    "cooked",
    query,
    eidsPath,
  ], { stdio: ["ignore", "ignore", "pipe"] })
  return performance.now() - startedAt
}

function buildIndex(idsgrepPath: string, eidsPath: string) {
  const startedAt = performance.now()
  const index = execFileSync(idsgrepPath, ["-G", eidsPath], {
    maxBuffer: 128 * 1024 * 1024,
  })
  return { index, elapsedMs: performance.now() - startedAt }
}

function createPrng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function shuffled<T>(values: T[], random: () => number) {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[values[index], values[other]] = [values[other], values[index]]
  }
  return values
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  mkdirSync(options.workDirectory, { recursive: true })
  const preservedPath = resolve(options.workDirectory, "preserved.eids")
  const headlessPath = resolve(options.workDirectory, "headless.eids")
  const source = readFileSync(options.eidsPath, "utf8")
  writeFileSync(preservedPath, source)
  const projectionStartedAt = performance.now()
  const projection = dropEidsStructuralHeads(source)
  writeFileSync(headlessPath, projection.output)
  const projectionMs = performance.now() - projectionStartedAt

  const preservedIndexPath = preservedPath.replace(/\.eids$/u, ".bvec")
  const headlessIndexPath = headlessPath.replace(/\.eids$/u, ".bvec")
  const indexBuildSamples = { preserved: [] as number[], headless: [] as number[] }
  let preservedIndex: Buffer | undefined
  let headlessIndex: Buffer | undefined
  for (const corpus of shuffled(
    Array.from({ length: 10 }, () => ["preserved", "headless"] as const).flat(),
    createPrng(options.seed),
  )) {
    const built = buildIndex(
      options.idsgrepPath,
      corpus === "preserved" ? preservedPath : headlessPath,
    )
    indexBuildSamples[corpus].push(built.elapsedMs)
    if (corpus === "preserved") preservedIndex = built.index
    else headlessIndex = built.index
  }
  if (!preservedIndex || !headlessIndex) throw new Error("index build failed")
  writeFileSync(preservedIndexPath, preservedIndex)
  writeFileSync(headlessIndexPath, headlessIndex)
  const manifest = JSON.parse(readFileSync(options.manifestPath, "utf8")) as {
    caseSetVersion: number
    cases: BenchmarkCase[]
  }
  const corpora = {
    preserved: preservedPath,
    headless: headlessPath,
  }
  const samples = new Map<string, number[]>()
  for (const benchmarkCase of manifest.cases) {
    for (const corpus of Object.keys(corpora)) {
      samples.set(`${benchmarkCase.name}:${corpus}`, [])
    }
  }
  const tasks = (repetitions: number) => {
    const result: Array<{ caseIndex: number; corpus: keyof typeof corpora }> = []
    for (let repetition = 0; repetition < repetitions; repetition++) {
      for (let caseIndex = 0; caseIndex < manifest.cases.length; caseIndex++) {
        result.push({ caseIndex, corpus: "preserved" })
        result.push({ caseIndex, corpus: "headless" })
      }
    }
    return result
  }
  const random = createPrng(options.seed)
  for (const task of shuffled(tasks(options.warmup), random)) {
    const benchmarkCase = manifest.cases[task.caseIndex]
    timedSearch(options.idsgrepPath, corpora[task.corpus], benchmarkCase.idsgrepQuery)
  }
  for (const task of shuffled(tasks(options.iterations), random)) {
    const benchmarkCase = manifest.cases[task.caseIndex]
    samples.get(`${benchmarkCase.name}:${task.corpus}`)!.push(
      timedSearch(
        options.idsgrepPath,
        corpora[task.corpus],
        benchmarkCase.idsgrepQuery,
      ),
    )
  }

  const commonCases = manifest.cases.map(benchmarkCase => {
    const preserved = statistics(
      options.idsgrepPath,
      preservedPath,
      benchmarkCase.idsgrepQuery,
    )
    const headless = statistics(
      options.idsgrepPath,
      headlessPath,
      benchmarkCase.idsgrepQuery,
    )
    return {
      ...benchmarkCase,
      sameResultCount: preserved.treeHits === headless.treeHits,
      preserved: {
        statistics: preserved,
        timing: summarize(samples.get(`${benchmarkCase.name}:preserved`)!),
      },
      headless: {
        statistics: headless,
        timing: summarize(samples.get(`${benchmarkCase.name}:headless`)!),
      },
    }
  })
  const headSensitiveCases = [
    { name: "fragment-head-rest", query: "...<休>(marker)" },
    { name: "root-head-rest", query: "<休>(marker)" },
    { name: "structural-rest", query: "...⿰亻木" },
  ].map(item => ({
    ...item,
    preserved: statistics(options.idsgrepPath, preservedPath, item.query),
    headless: statistics(options.idsgrepPath, headlessPath, item.query),
  }))

  const artifact = {
    formatVersion: 1,
    caseSetVersion: manifest.caseSetVersion,
    iterations: options.iterations,
    warmup: options.warmup,
    seed: options.seed,
    environment: collectBenchmarkEnvironment(),
    projection: {
      structuralHeadsRemoved: projection.removed,
      elapsedMs: projectionMs,
    },
    corpora: {
      preserved: {
        eids: {
          path: preservedPath,
          bytes: statSync(preservedPath).size,
          sha256: hashFile(preservedPath),
        },
        index: {
          path: preservedIndexPath,
          bytes: statSync(preservedIndexPath).size,
          sha256: hashFile(preservedIndexPath),
          build: summarize(indexBuildSamples.preserved),
        },
      },
      headless: {
        eids: {
          path: headlessPath,
          bytes: statSync(headlessPath).size,
          sha256: hashFile(headlessPath),
        },
        index: {
          path: headlessIndexPath,
          bytes: statSync(headlessIndexPath).size,
          sha256: hashFile(headlessIndexPath),
          build: summarize(indexBuildSamples.headless),
        },
      },
    },
    commonCases,
    headSensitiveCases,
  }
  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, JSON.stringify(artifact, null, 2) + "\n")
  process.stdout.write(JSON.stringify(artifact, null, 2) + "\n")
}

main()
