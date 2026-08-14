import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import os from "node:os"
import { resolve } from "node:path"
import { performance } from "node:perf_hooks"

import {
  createBvecIdsfindCandidateProvider,
  createIdsfind,
  ftsIdsfindCandidateProvider,
  type IdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core"
import { createBetterSqlite3ExecutorProvider } from "@mandel59/mojidata-api-better-sqlite3"
import { convertEidsDictionary } from "@mandel59/idsflow-eids"

type BenchmarkCase = {
  name: string
  description: string
  mojidataQuery: string[]
  idsgrepQuery: string
}

type Options = {
  idsgrepPath: string
  eidsPath: string
  fts4Path: string
  fts5Path: string
  bvecPath: string
  manifestPath: string
  outputPath?: string
  iterations: number
  warmup: number
}

type Target = {
  name: string
  search: (item: BenchmarkCase) => Promise<string[]>
  timedSearch: (item: BenchmarkCase) => Promise<void>
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
    manifestPath: values.get("--manifest")
      ? resolve(values.get("--manifest") as string)
      : resolve(__dirname, "idsgrep-eids-cases.json"),
    outputPath: values.get("--output")
      ? resolve(values.get("--output") as string)
      : undefined,
    iterations: parseCount(values.get("--iterations"), 30, "iterations"),
    warmup: parseCount(values.get("--warmup"), 5, "warmup"),
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
  const manifestBytes = readFileSync(options.manifestPath)
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    caseSetVersion: number
    cases: BenchmarkCase[]
  }
  const idsgrepIndexPath = options.eidsPath.replace(/\.eids$/u, ".bvec")
  const targets: Target[] = [
    createIdsGrepTarget("idsgrep-indexed", options, false),
    createIdsGrepTarget("idsgrep-scan", options, true),
    createIdsTarget("mojidata-fts4", options.fts4Path, ftsIdsfindCandidateProvider),
    createIdsTarget("mojidata-fts5", options.fts5Path, ftsIdsfindCandidateProvider),
    createIdsTarget("mojidata-bvec", options.bvecPath, createBvecIdsfindCandidateProvider()),
  ]

  const correctness = []
  for (const item of manifest.cases) {
    const results = Object.fromEntries(
      await Promise.all(targets.map(async target => [target.name, await target.search(item)])),
    ) as Record<string, string[]>
    const expected = results["idsgrep-indexed"]
    correctness.push({
      name: item.name,
      idsgrepStatistics: idsGrepStatistics(options, item),
      resultCounts: Object.fromEntries(
        targets.map(target => [target.name, results[target.name].length]),
      ),
      comparisons: Object.fromEntries(targets.slice(1).map(target => {
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
  const tasks = []
  for (let repetition = 0; repetition < options.iterations; repetition++) {
    for (const item of manifest.cases) {
      for (const target of targets) tasks.push({ item, target })
    }
  }
  for (const { item, target } of shuffled(tasks)) {
    const startedAt = performance.now()
    await target.timedSearch(item)
    const key = `${item.name}:${target.name}`
    const values = samples.get(key) ?? []
    values.push(performance.now() - startedAt)
    samples.set(key, values)
  }

  const payload = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    inputs: {
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
      }])),
      manifest: {
        path: options.manifestPath,
        sha256: createHash("sha256").update(manifestBytes).digest("hex"),
        caseSetVersion: manifest.caseSetVersion,
      },
    },
    method: {
      iterations: options.iterations,
      warmup: options.warmup,
      idsgrepIndexedUsesSiblingBvec: true,
      idsgrepTimingIncludesProcessStartup: true,
      outputDuringTiming: "discarded after each engine materialized its result",
    },
    environment: {
      node: process.version,
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model,
    },
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
