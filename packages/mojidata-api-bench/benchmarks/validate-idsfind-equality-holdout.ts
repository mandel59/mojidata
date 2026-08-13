import { createHash } from "node:crypto"
import { readFileSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  createIdsfind,
  createStructuralFtsIdsfindCandidateProvider,
  ftsIdsfindCandidateProvider,
  type IdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"
import { createBetterSqlite3ExecutorProvider } from "@mandel59/mojidata-api-better-sqlite3"

const repositoryRoot = resolve(__dirname, "../../..")

function parseArgs(argv: string[]) {
  let basePath: string | undefined
  let equalityPath: string | undefined
  let manifestPath: string | undefined
  let outputPath: string | undefined
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--base": basePath = argv[++index]; break
      case "--equality": equalityPath = argv[++index]; break
      case "--manifest": manifestPath = argv[++index]; break
      case "--output": outputPath = argv[++index]; break
      default: throw new Error(`Unknown argument: ${argv[index]}`)
    }
  }
  if (!basePath || !equalityPath || !manifestPath || !outputPath) {
    throw new Error(
      "Usage: --base <db> --equality <db> --manifest <json> --output <json>",
    )
  }
  return {
    basePath: resolve(repositoryRoot, basePath),
    equalityPath: resolve(repositoryRoot, equalityPath),
    manifestPath: resolve(repositoryRoot, manifestPath),
    outputPath: resolve(repositoryRoot, outputPath),
  }
}

function hashFile(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function sameSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every(value => rightSet.has(value))
}

function recall(candidates: string[], answers: string[]) {
  if (answers.length === 0) return 1
  const candidateSet = new Set(candidates)
  return answers.filter(value => candidateSet.has(value)).length / answers.length
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifestBytes = readFileSync(options.manifestPath)
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    caseSetVersion: number
    cases: {
      name: string
      ids: string[]
      screeningResultCount?: number
    }[]
  }

  const baseDb = createBetterSqlite3ExecutorProvider(options.basePath)
  const equalityDb = createBetterSqlite3ExecutorProvider(options.equalityPath)
  const allUcsProvider: IdsfindCandidateProvider = {
    async getCandidates(db) {
      const rows = await db.query<{ UCS?: string }>(
        "SELECT DISTINCT UCS FROM idsfind ORDER BY UCS",
      )
      return rows.flatMap(row => typeof row.UCS === "string" ? [row.UCS] : [])
    },
  }
  const equalityProvider =
    createStructuralFtsIdsfindCandidateProvider(["equality"])
  const exactScan = createIdsfind(baseDb, allUcsProvider)
  const currentFts = createIdsfind(baseDb, ftsIdsfindCandidateProvider)
  const equalityFts = createIdsfind(equalityDb, equalityProvider)

  const results = []
  for (const entry of manifest.cases) {
    const tokenized = tokenizeIdsList(entry.ids)
    const [exact, current, equality, currentCandidates, equalityCandidates] =
      await Promise.all([
        exactScan(entry.ids),
        currentFts(entry.ids),
        equalityFts(entry.ids),
        ftsIdsfindCandidateProvider.getCandidates(
          await baseDb(),
          tokenized.forQuery,
          tokenized.forAudit,
        ),
        equalityProvider.getCandidates(
          await equalityDb(),
          tokenized.forQuery,
          tokenized.forAudit,
        ),
      ])
    const sameCurrent = sameSet(exact, current)
    const sameEquality = sameSet(exact, equality)
    const screeningCountMatches = entry.screeningResultCount === exact.length
    if (!sameCurrent || !sameEquality || !screeningCountMatches) {
      throw new Error(
        `Validation mismatch for ${entry.name}: exact=${exact.length}, ` +
          `current=${current.length}, equality=${equality.length}, ` +
          `screening=${entry.screeningResultCount}`,
      )
    }
    results.push({
      name: entry.name,
      exactResultCount: exact.length,
      screeningCountMatches,
      currentFts: {
        candidateCount: currentCandidates.length,
        candidateRecall: recall(currentCandidates, exact),
        sameExactResults: sameCurrent,
      },
      compactEqualityFts: {
        candidateCount: equalityCandidates.length,
        candidateRecall: recall(equalityCandidates, exact),
        sameExactResults: sameEquality,
      },
    })
  }

  const baseExecutor = await baseDb()
  const equalityExecutor = await equalityDb()
  const integrity = await equalityExecutor.query<{ integrity_check?: string }>(
    "PRAGMA integrity_check",
  )
  const metadata = await equalityExecutor.query<Record<string, unknown>>(
    "SELECT * FROM idsfind_structural_meta WHERE schema_version = 1",
  )
  const payload = {
    formatVersion: 1,
    caseSetVersion: manifest.caseSetVersion,
    manifest: {
      path: options.manifestPath,
      bytes: statSync(options.manifestPath).size,
      sha256: createHash("sha256").update(manifestBytes).digest("hex"),
    },
    databases: {
      base: {
        path: options.basePath,
        bytes: statSync(options.basePath).size,
        sha256: hashFile(options.basePath),
      },
      compactEquality: {
        path: options.equalityPath,
        bytes: statSync(options.equalityPath).size,
        sha256: hashFile(options.equalityPath),
        integrity,
        metadata,
      },
    },
    populationUcs: (
      await baseExecutor.query<{ count?: number }>(
        "SELECT count(DISTINCT UCS) AS count FROM idsfind",
      )
    )[0]?.count,
    cases: results,
    summary: {
      cases: results.length,
      currentExactMatches: results.filter(
        entry => entry.currentFts.sameExactResults,
      ).length,
      equalityExactMatches: results.filter(
        entry => entry.compactEqualityFts.sameExactResults,
      ).length,
      currentRecallOne: results.filter(
        entry => entry.currentFts.candidateRecall === 1,
      ).length,
      equalityRecallOne: results.filter(
        entry => entry.compactEqualityFts.candidateRecall === 1,
      ).length,
      screeningCountMatches: results.filter(
        entry => entry.screeningCountMatches,
      ).length,
    },
  }
  writeFileSync(options.outputPath, JSON.stringify(payload, null, 2) + "\n")
  process.stdout.write(JSON.stringify(payload.summary, null, 2) + "\n")
}

main()
