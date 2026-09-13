import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { basename } from "node:path"

import { summarize } from "./lib"

const targetNames = ["fts5", "fts5-decompose", "fts5-legacy"] as const
const phaseNames = ["compile", "candidate", "exactAudit", "total"] as const
type TargetName = typeof targetNames[number]
type PhaseName = typeof phaseNames[number]

type Phase = {
  samplesMs: number[]
  summary: {
    minMs: number
    avgMs: number
    p50Ms: number
    p95Ms: number
    maxMs: number
  }
  p50Ci95: {
    lowMs: number
    highMs: number
    resamples: number
  }
}

type IndexMeasurement = {
  candidateCount: number
  compile: Phase
  candidate: Phase
  exactAudit: Phase
  total: Phase
}

type CaseResult = {
  name: string
  resultCount: number
  sameResults: boolean
  indexes: Record<string, IndexMeasurement>
}

type PhaseArtifact = {
  formatVersion: number
  revision: {
    jjCommitId: string
    jjChangeId: string
    jjWorkingCopySummary: string
  }
  environment: {
    timestamp: string
    nodeVersion: string
    platform: string
    arch: string
    gitRevision: string
    gitDirty: boolean
  }
  seed: number
  iterations: number
  warmupIterations: number
  candidateTiming: string
  caseSetVersion: number
  caseManifest: { path: string; sha256: string }
  selectedCases: string[]
  databases: Record<string, { path: string; bytes: number; sha256: string }>
  results: CaseResult[]
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function close(left: number, right: number, tolerance = 1e-9) {
  return Math.abs(left - right) <= tolerance
}

function validatePhase(
  phase: Phase,
  iterations: number,
  locator: string,
) {
  assert(Array.isArray(phase.samplesMs), `${locator}: missing samples`)
  assert(
    phase.samplesMs.length === iterations,
    `${locator}: expected ${iterations} samples, got ${phase.samplesMs.length}`,
  )
  assert(
    phase.samplesMs.every(isFiniteNonnegative),
    `${locator}: samples must be finite and nonnegative`,
  )
  const recomputed = summarize(phase.samplesMs)
  for (const key of ["minMs", "avgMs", "p50Ms", "p95Ms", "maxMs"] as const) {
    assert(
      close(recomputed[key], phase.summary[key]),
      `${locator}: ${key} does not match samples`,
    )
  }
  assert(
    phase.p50Ci95.lowMs <= phase.summary.p50Ms &&
      phase.summary.p50Ms <= phase.p50Ci95.highMs,
    `${locator}: median is outside its interval`,
  )
  assert(
    phase.p50Ci95.resamples >= 1000,
    `${locator}: insufficient bootstrap resamples`,
  )
}

function intervalsOverlap(left: Phase, right: Phase) {
  return Math.max(left.p50Ci95.lowMs, right.p50Ci95.lowMs) <=
    Math.min(left.p50Ci95.highMs, right.p50Ci95.highMs)
}

const [artifactPath] = process.argv.slice(2)
if (!artifactPath) {
  throw new Error("Usage: evaluate-idsflow-s4-overhead <phase-artifact>")
}

const bytes = readFileSync(artifactPath)
const artifact = JSON.parse(bytes.toString("utf8")) as PhaseArtifact
const input = {
  file: basename(artifactPath),
  sha256: createHash("sha256").update(bytes).digest("hex"),
}

assert(artifact.formatVersion === 2, "S4 requires benchmark format 2")
assert(artifact.candidateTiming === "embedded", "S4 requires embedded candidate timing")
assert(Number.isInteger(artifact.seed), "S4 requires a recorded integer seed")
assert(artifact.iterations >= 30, "S4 requires at least 30 measured iterations")
assert(artifact.warmupIterations >= 5, "S4 requires at least 5 warm-up iterations")
assert(artifact.caseSetVersion === 1, "unexpected case-set version")
assert(artifact.results.length > 0, "phase artifact has no results")
assert(
  artifact.selectedCases.length === artifact.results.length,
  "selected-case and result counts differ",
)
assert(artifact.environment.gitDirty === false, "benchmark revision was dirty")
assert(
  artifact.revision.jjWorkingCopySummary === "",
  "benchmark Jujutsu working copy was dirty",
)
assert(
  artifact.environment.gitRevision === artifact.revision.jjCommitId,
  "Git and Jujutsu revisions differ",
)
assert(
  artifact.caseManifest.sha256.length === 64,
  "case manifest has no SHA-256 identity",
)

const phaseClosureResiduals: number[] = []
const compileShares: number[] = []
const caseSummaries: Array<{
  name: string
  resultCount: number
  candidateCount: number
  targets: Record<string, {
    compileP50Ms: number
    candidateP50Ms: number
    exactAuditP50Ms: number
    totalP50Ms: number
    compileSharePercent: number
  }>
}> = []

for (const result of artifact.results) {
  assert(artifact.selectedCases.includes(result.name), `${result.name}: not selected`)
  assert(result.sameResults === true, `${result.name}: result sets differ`)
  const actualTargets = Object.keys(result.indexes).sort()
  assert(
    JSON.stringify(actualTargets) === JSON.stringify([...targetNames].sort()),
    `${result.name}: unexpected target set`,
  )
  const candidateCounts = targetNames.map(name => result.indexes[name].candidateCount)
  assert(
    candidateCounts.every(count => count === candidateCounts[0]),
    `${result.name}: candidate counts differ`,
  )
  assert(
    candidateCounts[0] >= result.resultCount,
    `${result.name}: candidate count is smaller than result count`,
  )

  const targets: Record<string, {
    compileP50Ms: number
    candidateP50Ms: number
    exactAuditP50Ms: number
    totalP50Ms: number
    compileSharePercent: number
  }> = {}

  for (const targetName of targetNames) {
    const measurement = result.indexes[targetName]
    for (const phaseName of phaseNames) {
      validatePhase(
        measurement[phaseName],
        artifact.iterations,
        `${result.name}/${targetName}/${phaseName}`,
      )
    }
    for (let index = 0; index < artifact.iterations; index++) {
      phaseClosureResiduals.push(
        measurement.total.samplesMs[index] -
          measurement.compile.samplesMs[index] -
          measurement.candidate.samplesMs[index] -
          measurement.exactAudit.samplesMs[index],
      )
    }
    const compileSharePercent =
      measurement.compile.summary.p50Ms / measurement.total.summary.p50Ms * 100
    compileShares.push(compileSharePercent)
    targets[targetName] = {
      compileP50Ms: measurement.compile.summary.p50Ms,
      candidateP50Ms: measurement.candidate.summary.p50Ms,
      exactAuditP50Ms: measurement.exactAudit.summary.p50Ms,
      totalP50Ms: measurement.total.summary.p50Ms,
      compileSharePercent,
    }
  }
  caseSummaries.push({
    name: result.name,
    resultCount: result.resultCount,
    candidateCount: candidateCounts[0],
    targets,
  })
}

const comparisonPairs: Array<[TargetName, TargetName]> = [
  ["fts5", "fts5-decompose"],
  ["fts5", "fts5-legacy"],
  ["fts5-decompose", "fts5-legacy"],
]
const totalComparisons = artifact.results.flatMap(result =>
  comparisonPairs.map(([left, right]) => ({
    case: result.name,
    left,
    right,
    leftP50Ms: result.indexes[left].total.summary.p50Ms,
    rightP50Ms: result.indexes[right].total.summary.p50Ms,
    deltaPercent:
      (result.indexes[left].total.summary.p50Ms /
        result.indexes[right].total.summary.p50Ms - 1) * 100,
    p50Ci95Overlap: intervalsOverlap(
      result.indexes[left].total,
      result.indexes[right].total,
    ),
  }))
)

const compileP50Values = artifact.results.flatMap(result =>
  targetNames.map(name => result.indexes[name].compile.summary.p50Ms)
)
const decomposeMinusRawCompileP50Ms = artifact.results.map(result =>
  result.indexes["fts5-decompose"].compile.summary.p50Ms -
    result.indexes.fts5.compile.summary.p50Ms
)
const legacyMinusDecomposeCompileP50Ms = artifact.results.map(result =>
  result.indexes["fts5-legacy"].compile.summary.p50Ms -
    result.indexes["fts5-decompose"].compile.summary.p50Ms
)
const decomposeMinusRawCompileSharePercent = artifact.results.map(result =>
  (result.indexes["fts5-decompose"].compile.summary.p50Ms -
    result.indexes.fts5.compile.summary.p50Ms) /
    result.indexes["fts5-decompose"].total.summary.p50Ms * 100
)
const residualMinMs = Math.min(...phaseClosureResiduals)
const residualMaxMs = Math.max(...phaseClosureResiduals)
const overlappingComparisons = totalComparisons.filter(
  comparison => comparison.p50Ci95Overlap,
).length
const gatePassed =
  artifact.results.every(result => result.sameResults) &&
  overlappingComparisons === totalComparisons.length &&
  residualMinMs >= -1e-9

const output = {
  schemaVersion: 1,
  purpose: "idsflow-s4-overhead-evidence-closure",
  timingIncluded: true,
  input,
  provenance: {
    revision: artifact.revision.jjCommitId,
    change: artifact.revision.jjChangeId,
    clean: true,
    environment: {
      nodeVersion: artifact.environment.nodeVersion,
      platform: artifact.environment.platform,
      arch: artifact.environment.arch,
    },
    caseManifest: {
      file: basename(artifact.caseManifest.path),
      sha256: artifact.caseManifest.sha256,
    },
    databases: Object.fromEntries(targetNames.map(name => [name, {
      bytes: artifact.databases[name].bytes,
      sha256: artifact.databases[name].sha256,
    }])),
  },
  design: {
    caseSetVersion: artifact.caseSetVersion,
    cases: artifact.results.length,
    targets: targetNames,
    iterations: artifact.iterations,
    warmupIterations: artifact.warmupIterations,
    seed: artifact.seed,
    bootstrapMedianResamples: artifact.results[0].indexes.fts5.total.p50Ci95.resamples,
    candidateTiming: artifact.candidateTiming,
  },
  validation: {
    resultSetsEqual: artifact.results.filter(result => result.sameResults).length,
    candidateCountsEqual: artifact.results.length,
    phaseSeriesValidated: artifact.results.length * targetNames.length * phaseNames.length,
    phaseSampleCount: artifact.iterations,
    phaseClosureResidualMs: { min: residualMinMs, max: residualMaxMs },
  },
  overhead: {
    compileP50Ms: {
      min: Math.min(...compileP50Values),
      max: Math.max(...compileP50Values),
    },
    compileShareOfTotalP50Percent: {
      min: Math.min(...compileShares),
      max: Math.max(...compileShares),
    },
    decomposeMinusRawCompileP50Ms: {
      min: Math.min(...decomposeMinusRawCompileP50Ms),
      max: Math.max(...decomposeMinusRawCompileP50Ms),
    },
    decomposeMinusRawCompileShareOfTotalP50Percent: {
      min: Math.min(...decomposeMinusRawCompileSharePercent),
      max: Math.max(...decomposeMinusRawCompileSharePercent),
    },
    legacyMinusDecomposeCompileP50Ms: {
      min: Math.min(...legacyMinusDecomposeCompileP50Ms),
      max: Math.max(...legacyMinusDecomposeCompileP50Ms),
    },
    totalMedianCiComparisons: totalComparisons.length,
    totalMedianCiOverlaps: overlappingComparisons,
  },
  caseSummaries,
  totalComparisons,
  scope: {
    executionBoundary: "warm-process repeated query after five warm-up iterations",
    corpus: "one neutral CHISE EIDS FTS5 corpus copied with three semantics manifests",
    excludes: [
      "cold process and SQLite open",
      "first uncached manifest load",
      "cross-machine performance generalization",
      "performance ranking when median confidence intervals overlap",
    ],
  },
  gate: {
    name: "S4-overhead",
    passed: gatePassed,
    condition:
      "phase-attributed warm-process cost is reproducible from samples, semantics variants preserve results/candidates, and all pairwise total-median intervals overlap",
  },
}

process.stdout.write(JSON.stringify(output, null, 2) + "\n")
if (!gatePassed) process.exitCode = 1
