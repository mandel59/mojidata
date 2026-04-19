import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

import { createBetterSqlite3App } from "@mandel59/mojidata-api-better-sqlite3"
import { createNodeSqliteApp } from "@mandel59/mojidata-api-node-sqlite"
import { createNodeApp } from "@mandel59/mojidata-api-runtime"

import {
  benchmarkFormatVersion,
  collectBenchmarkEnvironment,
  formatMs,
  summarize,
  type BenchmarkRun,
  type ScenarioResult,
} from "./lib"
import { loadScenarioManifest, type Scenario } from "./scenario-manifest"

type Options = {
  backend?: LocalBackend
  baseUrl?: string
  label?: string
  outputPath?: string
  iterations: number
  warmupIterations: number
  coldIterations: number
  format: "table" | "json"
  scenarioNames: string[]
}

type LocalBackend = "sqljs" | "better-sqlite3" | "node:sqlite"

type ScenarioSamples = {
  name: string
  description: string
  samplesMs: number[]
  coldStartMs?: number[]
}

const defaultOrigin = "http://benchmark.local"
const defaultLocalBackend: LocalBackend = "sqljs"

function parseIntegerOption(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${value}`)
  }
  return parsed
}

function parseBackendOption(value: string | undefined): LocalBackend | undefined {
  if (value === undefined) return undefined
  if (value === "sqljs" || value === "better-sqlite3" || value === "node:sqlite") {
    return value
  }
  throw new Error(`backend must be "sqljs", "better-sqlite3", or "node:sqlite", got: ${value}`)
}

function createLocalApp(backend: LocalBackend) {
  switch (backend) {
    case "better-sqlite3":
      return createBetterSqlite3App()
    case "node:sqlite":
      return createNodeSqliteApp()
    case "sqljs":
    default:
      return createNodeApp()
  }
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    backend: parseBackendOption(process.env.MOJIDATA_API_BENCH_BACKEND),
    baseUrl: process.env.MOJIDATA_API_BASE_URL,
    label: process.env.MOJIDATA_API_BENCH_LABEL,
    outputPath: process.env.MOJIDATA_API_BENCH_OUTPUT,
    iterations: parseIntegerOption(process.env.MOJIDATA_BENCH_ITERATIONS, 30, "iterations"),
    warmupIterations: parseIntegerOption(process.env.MOJIDATA_BENCH_WARMUP, 5, "warmup"),
    coldIterations: parseIntegerOption(process.env.MOJIDATA_BENCH_COLD, 3, "cold"),
    format: process.env.MOJIDATA_BENCH_FORMAT === "json" ? "json" : "table",
    scenarioNames: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--backend":
        options.backend = parseBackendOption(argv[++index])
        break
      case "--base-url":
        options.baseUrl = argv[++index]
        break
      case "--label":
        options.label = argv[++index]
        break
      case "--output":
        options.outputPath = argv[++index]
        break
      case "--iterations":
        options.iterations = parseIntegerOption(argv[++index], options.iterations, "iterations")
        break
      case "--warmup":
        options.warmupIterations = parseIntegerOption(argv[++index], options.warmupIterations, "warmup")
        break
      case "--cold":
        options.coldIterations = parseIntegerOption(argv[++index], options.coldIterations, "cold")
        break
      case "--format": {
        const format = argv[++index]
        if (format !== "table" && format !== "json") {
          throw new Error(`format must be "table" or "json", got: ${format}`)
        }
        options.format = format
        break
      }
      case "--scenario": {
        const name = argv[++index]
        if (!name) throw new Error("--scenario requires a value")
        options.scenarioNames.push(name)
        break
      }
      case "--help":
      case "-h":
        printHelp()
        process.exit(0)
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (options.iterations === 0) {
    throw new Error("iterations must be greater than 0")
  }

  if (options.baseUrl && options.backend) {
    throw new Error('Use "--label" instead of "--backend" when benchmarking a remote target')
  }

  return options
}

function printHelp() {
  const { scenarios } = loadScenarioManifest()
  console.log(`Usage: yarn bench [options]

Options:
  --backend <sqljs|better-sqlite3|node:sqlite>
                         Select the local in-process backend (default: sqljs)
  --base-url <url>       Benchmark an already-running HTTP server
  --label <label>        Override the benchmark target label
  --output <path>        Write machine-readable JSON results to a file
  --iterations <n>       Measured iterations per scenario (default: 30)
  --warmup <n>           Warmup iterations per scenario (default: 5)
  --cold <n>             Cold-start iterations per scenario (default: 3, in-process only)
  --format <table|json>  Console output format (default: table)
  --scenario <name>      Run only the named scenario (repeatable)
  --help                 Show this help

Examples:
  yarn bench --backend sqljs
  yarn bench --backend better-sqlite3 --output ./tmp/better-sqlite3.json
  yarn bench --backend node:sqlite --output ./tmp/node-sqlite.json
  yarn bench --base-url http://localhost:3001 --label worker-http --output ./tmp/worker.json

Scenarios:
${scenarios.map((scenario) => `  - ${scenario.name}: ${scenario.description}`).join("\n")}`)
}

function getSelectedScenarios(names: string[]): Scenario[] {
  const { scenarios } = loadScenarioManifest()
  if (names.length === 0) return scenarios
  return names.map((name) => {
    const scenario = scenarios.find((entry) => entry.name === name)
    if (!scenario) {
      throw new Error(
        `Unknown scenario: ${name}\nAvailable scenarios: ${scenarios.map((entry) => entry.name).join(", ")}`,
      )
    }
    return scenario
  })
}

function createUrl(pathname: string, query: Scenario["query"], baseUrl: string): string {
  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
  if (!query) return url.toString()

  for (const [key, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    for (const value of values) {
      url.searchParams.append(key, String(value))
    }
  }

  return url.toString()
}

async function timedRequest(
  execute: (url: string) => Response | Promise<Response>,
  scenario: Scenario,
  baseUrl: string,
): Promise<number> {
  const url = createUrl(scenario.pathname, scenario.query, baseUrl)
  const startedAt = performance.now()
  const response = await Promise.resolve(execute(url))
  const finishedAt = performance.now()
  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `Scenario ${scenario.name} failed with ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
    )
  }

  try {
    JSON.parse(text)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown parse error: ${String(error)}`
    throw new Error(`Scenario ${scenario.name} returned invalid JSON: ${message}`)
  }

  return finishedAt - startedAt
}

function createResult(samples: ScenarioSamples): ScenarioResult {
  return {
    ...samples,
    summary: summarize(samples.samplesMs),
    coldSummary:
      samples.coldStartMs && samples.coldStartMs.length > 0
        ? summarize(samples.coldStartMs)
        : undefined,
  }
}

function benchmarkLabel(options: Options): string {
  if (options.label) return options.label
  if (options.baseUrl) return `remote:${options.baseUrl}`
  return `in-process:${options.backend ?? defaultLocalBackend}`
}

function createPayload(
  results: ScenarioSamples[],
  scenarioSetVersion: number,
  selectedScenarios: Scenario[],
  options: Options,
): BenchmarkRun {
  const label = benchmarkLabel(options)
  return {
    formatVersion: benchmarkFormatVersion,
    scenarioSetVersion,
    selectedScenarios: selectedScenarios.map((scenario) => scenario.name),
    mode: options.baseUrl ? "remote" : "in-process",
    label,
    backend: options.baseUrl ? undefined : options.backend ?? defaultLocalBackend,
    baseUrl: options.baseUrl,
    iterations: options.iterations,
    warmupIterations: options.warmupIterations,
    coldIterations: options.baseUrl ? 0 : options.coldIterations,
    environment: collectBenchmarkEnvironment(),
    results: results.map(createResult),
  }
}

function printTable(payload: BenchmarkRun) {
  const mode = payload.baseUrl ? `remote (${payload.baseUrl})` : `in-process (${payload.backend})`
  console.log(
    `mojidata-api benchmark: ${payload.label}\n` +
      `mode=${mode}\n` +
      `iterations=${payload.iterations}, warmup=${payload.warmupIterations}, cold=${payload.coldIterations}`,
  )

  if (payload.environment.gitRevision) {
    console.log(`git=${payload.environment.gitRevision}`)
  }
  console.log(`timestamp=${payload.environment.timestamp}`)
  console.log("")

  const headers = ["scenario", "cold avg", "avg", "p50", "p95", "max"]
  const rows = payload.results.map((result) => [
    result.name,
    formatMs(result.coldSummary?.avgMs),
    formatMs(result.summary.avgMs),
    formatMs(result.summary.p50Ms),
    formatMs(result.summary.p95Ms),
    formatMs(result.summary.maxMs),
  ])

  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...rows.map((row) => row[columnIndex]?.length ?? 0)),
  )

  const formatRow = (row: string[]) =>
    row.map((value, columnIndex) => value.padEnd(widths[columnIndex])).join("  ")

  console.log(formatRow(headers))
  console.log(formatRow(widths.map((width) => "-".repeat(width))))
  for (const row of rows) {
    console.log(formatRow(row))
  }

  console.log("")
  for (const result of payload.results) {
    console.log(`${result.name}: ${result.description}`)
  }
}

function writeJsonOutput(payload: BenchmarkRun, outputPath: string) {
  const resolvedPath = resolve(outputPath)
  mkdirSync(dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, JSON.stringify(payload, null, 2))
  console.error(`Saved benchmark JSON to ${resolvedPath}`)
}

async function runScenario(
  scenario: Scenario,
  options: Options,
): Promise<ScenarioSamples> {
  const baseUrl = options.baseUrl ?? defaultOrigin
  const result: ScenarioSamples = {
    name: scenario.name,
    description: scenario.description,
    samplesMs: [],
  }

  if (options.baseUrl) {
    for (let index = 0; index < options.warmupIterations; index += 1) {
      await timedRequest((url) => fetch(url), scenario, baseUrl)
    }
    for (let index = 0; index < options.iterations; index += 1) {
      result.samplesMs.push(await timedRequest((url) => fetch(url), scenario, baseUrl))
    }
    return result
  }

  const backend = options.backend ?? defaultLocalBackend

  if (options.coldIterations > 0) {
    result.coldStartMs = []
    for (let index = 0; index < options.coldIterations; index += 1) {
      const app = createLocalApp(backend)
      result.coldStartMs.push(
        await timedRequest((url) => app.fetch(new Request(url)), scenario, baseUrl),
      )
    }
  }

  const app = createLocalApp(backend)
  for (let index = 0; index < options.warmupIterations; index += 1) {
    await timedRequest((url) => app.fetch(new Request(url)), scenario, baseUrl)
  }
  for (let index = 0; index < options.iterations; index += 1) {
    result.samplesMs.push(
      await timedRequest((url) => app.fetch(new Request(url)), scenario, baseUrl),
    )
  }

  return result
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { scenarioSetVersion } = loadScenarioManifest()
  const selectedScenarios = getSelectedScenarios(options.scenarioNames)
  const results: ScenarioSamples[] = []

  for (const scenario of selectedScenarios) {
    results.push(await runScenario(scenario, options))
  }

  const payload = createPayload(results, scenarioSetVersion, selectedScenarios, options)

  if (options.outputPath) {
    writeJsonOutput(payload, options.outputPath)
  }

  if (options.format === "json") {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  printTable(payload)
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exit(1)
})
