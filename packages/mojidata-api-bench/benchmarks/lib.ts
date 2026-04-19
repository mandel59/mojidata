import { execFileSync, spawnSync } from "node:child_process"
import process from "node:process"

export const benchmarkFormatVersion = 1

export type BenchmarkMode = "in-process" | "remote"

export type BenchmarkSummary = {
  minMs: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

export type ScenarioResult = {
  name: string
  description: string
  samplesMs: number[]
  coldStartMs?: number[]
  summary: BenchmarkSummary
  coldSummary?: BenchmarkSummary
}

export type BenchmarkEnvironment = {
  timestamp: string
  nodeVersion: string
  platform: NodeJS.Platform
  arch: string
  cwd: string
  gitRevision?: string
  gitDirty?: boolean
}

export type BenchmarkRun = {
  formatVersion: number
  scenarioSetVersion: number
  selectedScenarios: string[]
  mode: BenchmarkMode
  label: string
  backend?: string
  baseUrl?: string
  iterations: number
  warmupIterations: number
  coldIterations: number
  environment: BenchmarkEnvironment
  results: ScenarioResult[]
}

export function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return Number.NaN
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * ratio) - 1),
  )
  return sortedValues[index]
}

export function summarize(samplesMs: number[]): BenchmarkSummary {
  const sortedValues = [...samplesMs].sort((left, right) => left - right)
  const total = sortedValues.reduce((sum, value) => sum + value, 0)
  return {
    minMs: sortedValues[0],
    avgMs: total / sortedValues.length,
    p50Ms: percentile(sortedValues, 0.5),
    p95Ms: percentile(sortedValues, 0.95),
    maxMs: sortedValues[sortedValues.length - 1],
  }
}

function readGitRevision(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim()
  } catch {
    return undefined
  }
}

function readGitDirty(): boolean | undefined {
  try {
    const result = spawnSync("git", ["diff", "--quiet", "--ignore-submodules", "HEAD", "--"], {
      cwd: process.cwd(),
      stdio: "ignore",
    })
    if (result.status === 0) return false
    if (result.status === 1) return true
    return undefined
  } catch {
    return undefined
  }
}

export function collectBenchmarkEnvironment(): BenchmarkEnvironment {
  return {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    gitRevision: readGitRevision(),
    gitDirty: readGitDirty(),
  }
}

export function formatMs(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-"
  return `${value.toFixed(2)} ms`
}

export function formatDeltaMs(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)} ms`
}

export function formatDeltaPct(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

export function deltaPct(baseline: number, candidate: number): number | undefined {
  if (baseline === 0) return undefined
  return ((candidate - baseline) / baseline) * 100
}
