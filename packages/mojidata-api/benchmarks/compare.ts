import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  deltaPct,
  formatDeltaMs,
  formatDeltaPct,
  formatMs,
  summarize,
  type BenchmarkRun,
  type ScenarioResult,
} from "./lib"

type CompareOptions = {
  baselinePath: string
  candidatePath: string
  format: "table" | "json"
}

type ScenarioComparison = {
  name: string
  description: string
  baseline: ScenarioResult
  candidate: ScenarioResult
  deltaAvgMs: number
  deltaAvgPct?: number
  deltaP95Ms: number
  deltaP95Pct?: number
  deltaColdAvgMs?: number
  deltaColdAvgPct?: number
}

function parseArgs(argv: string[]): CompareOptions {
  const positional: string[] = []
  let format: "table" | "json" = "table"

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--format": {
        const value = argv[++index]
        if (value !== "table" && value !== "json") {
          throw new Error(`format must be "table" or "json", got: ${value}`)
        }
        format = value
        break
      }
      case "--help":
      case "-h":
        printHelp()
        process.exit(0)
      default:
        positional.push(arg)
        break
    }
  }

  if (positional.length !== 2) {
    throw new Error("compare requires exactly two JSON files: <baseline> <candidate>")
  }

  return {
    baselinePath: positional[0],
    candidatePath: positional[1],
    format,
  }
}

function printHelp() {
  console.log(`Usage: yarn bench:compare [options] <baseline.json> <candidate.json>

Options:
  --format <table|json>  Output format (default: table)
  --help                 Show this help`)
}

function parseRun(filePath: string): BenchmarkRun {
  const raw = JSON.parse(readFileSync(resolve(filePath), "utf8")) as BenchmarkRun
  return {
    ...raw,
    results: raw.results.map((result) => ({
      ...result,
      summary: result.summary ?? summarize(result.samplesMs),
      coldSummary:
        result.coldSummary ??
        (result.coldStartMs && result.coldStartMs.length > 0
          ? summarize(result.coldStartMs)
          : undefined),
    })),
  }
}

function compareRuns(baseline: BenchmarkRun, candidate: BenchmarkRun) {
  const baselineByName = new Map(baseline.results.map((result) => [result.name, result]))
  const candidateByName = new Map(candidate.results.map((result) => [result.name, result]))

  const commonNames = [...baselineByName.keys()]
    .filter((name) => candidateByName.has(name))
    .sort()
  const baselineOnly = [...baselineByName.keys()]
    .filter((name) => !candidateByName.has(name))
    .sort()
  const candidateOnly = [...candidateByName.keys()]
    .filter((name) => !baselineByName.has(name))
    .sort()

  const scenarios: ScenarioComparison[] = commonNames.map((name) => {
    const baselineResult = baselineByName.get(name)!
    const candidateResult = candidateByName.get(name)!
    return {
      name,
      description: candidateResult.description,
      baseline: baselineResult,
      candidate: candidateResult,
      deltaAvgMs: candidateResult.summary.avgMs - baselineResult.summary.avgMs,
      deltaAvgPct: deltaPct(baselineResult.summary.avgMs, candidateResult.summary.avgMs),
      deltaP95Ms: candidateResult.summary.p95Ms - baselineResult.summary.p95Ms,
      deltaP95Pct: deltaPct(baselineResult.summary.p95Ms, candidateResult.summary.p95Ms),
      deltaColdAvgMs:
        baselineResult.coldSummary && candidateResult.coldSummary
          ? candidateResult.coldSummary.avgMs - baselineResult.coldSummary.avgMs
          : undefined,
      deltaColdAvgPct:
        baselineResult.coldSummary && candidateResult.coldSummary
          ? deltaPct(baselineResult.coldSummary.avgMs, candidateResult.coldSummary.avgMs)
          : undefined,
    }
  })

  return {
    baseline: {
      label: baseline.label,
      mode: baseline.mode,
      backend: baseline.backend,
      baseUrl: baseline.baseUrl,
      gitRevision: baseline.environment.gitRevision,
      timestamp: baseline.environment.timestamp,
    },
    candidate: {
      label: candidate.label,
      mode: candidate.mode,
      backend: candidate.backend,
      baseUrl: candidate.baseUrl,
      gitRevision: candidate.environment.gitRevision,
      timestamp: candidate.environment.timestamp,
    },
    scenarios,
    baselineOnly,
    candidateOnly,
  }
}

function printTable(result: ReturnType<typeof compareRuns>) {
  console.log(`baseline=${result.baseline.label}`)
  console.log(`candidate=${result.candidate.label}`)
  if (result.baseline.gitRevision || result.candidate.gitRevision) {
    console.log(
      `git=${result.baseline.gitRevision ?? "-"} -> ${result.candidate.gitRevision ?? "-"}`,
    )
  }
  console.log("")

  const includeCold = result.scenarios.some((scenario) => scenario.deltaColdAvgMs !== undefined)
  const headers = includeCold
    ? [
        "scenario",
        "base avg",
        "cand avg",
        "delta avg",
        "delta %",
        "base p95",
        "cand p95",
        "delta p95",
        "cold delta",
      ]
    : [
        "scenario",
        "base avg",
        "cand avg",
        "delta avg",
        "delta %",
        "base p95",
        "cand p95",
        "delta p95",
        "delta p95%",
      ]

  const rows = result.scenarios.map((scenario) =>
    includeCold
      ? [
          scenario.name,
          formatMs(scenario.baseline.summary.avgMs),
          formatMs(scenario.candidate.summary.avgMs),
          formatDeltaMs(scenario.deltaAvgMs),
          formatDeltaPct(scenario.deltaAvgPct),
          formatMs(scenario.baseline.summary.p95Ms),
          formatMs(scenario.candidate.summary.p95Ms),
          formatDeltaMs(scenario.deltaP95Ms),
          scenario.deltaColdAvgMs === undefined
            ? "-"
            : `${formatDeltaMs(scenario.deltaColdAvgMs)} (${formatDeltaPct(scenario.deltaColdAvgPct)})`,
        ]
      : [
          scenario.name,
          formatMs(scenario.baseline.summary.avgMs),
          formatMs(scenario.candidate.summary.avgMs),
          formatDeltaMs(scenario.deltaAvgMs),
          formatDeltaPct(scenario.deltaAvgPct),
          formatMs(scenario.baseline.summary.p95Ms),
          formatMs(scenario.candidate.summary.p95Ms),
          formatDeltaMs(scenario.deltaP95Ms),
          formatDeltaPct(scenario.deltaP95Pct),
        ],
  )

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

  if (result.baselineOnly.length > 0 || result.candidateOnly.length > 0) {
    console.log("")
    if (result.baselineOnly.length > 0) {
      console.log(`baseline only: ${result.baselineOnly.join(", ")}`)
    }
    if (result.candidateOnly.length > 0) {
      console.log(`candidate only: ${result.candidateOnly.join(", ")}`)
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const baseline = parseRun(options.baselinePath)
  const candidate = parseRun(options.candidatePath)
  const result = compareRuns(baseline, candidate)

  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  printTable(result)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exit(1)
}
