import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"

import Database from "better-sqlite3"

import { idsfindPatternAnalysisQuery } from "@mandel59/mojidata-api-core/lib/idsfind-query"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"

type BenchmarkCase = {
  name: string
  description: string
  ids: string[]
  stratum: string
  family: string
}

const require = createRequire(__filename)
const repositoryRoot = resolve(__dirname, "../../..")

function parseArgs(argv: string[]) {
  let manifestPath = "packages/mojidata-api-bench/benchmarks/idsfind-index-pilot-cases.json"
  let outputPath: string | undefined
  const caseNames: string[] = []
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--manifest":
        manifestPath = argv[++index]
        break
      case "--output":
        outputPath = argv[++index]
        break
      case "--case":
        caseNames.push(argv[++index])
        break
      default:
        throw new Error("Unknown argument: " + argv[index])
    }
  }
  return {
    manifestPath: resolve(repositoryRoot, manifestPath),
    outputPath: outputPath && resolve(repositoryRoot, outputPath),
    caseNames,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifestBytes = readFileSync(options.manifestPath)
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    caseSetVersion: number
    cases: BenchmarkCase[]
  }
  const cases = options.caseNames.length === 0
    ? manifest.cases
    : options.caseNames.map(name => {
      const found = manifest.cases.find(entry => entry.name === name)
      if (!found) throw new Error("Unknown case: " + name)
      return found
    })
  const dbPath = require.resolve("@mandel59/idsdb-fts5/idsfind.db")
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const analyze = db.prepare(idsfindPatternAnalysisQuery)
    const decompositionStats = db.prepare(`
      SELECT
        count(*) AS count,
        min(length(IDS_tokens) - length(replace(IDS_tokens, ' ', '')) + 1)
          AS min_tokens,
        max(length(IDS_tokens) - length(replace(IDS_tokens, ' ', '')) + 1)
          AS max_tokens
      FROM idsfind
      WHERE UCS = ?
    `)
    const results = cases.map(entry => {
      const tokenized = tokenizeIdsList(entry.ids).forQuery
      const row = analyze.get({
        idslist: JSON.stringify(tokenized),
        resolve_materialized_components: 1,
      }) as {
        pattern: string
        phrase_count: number
        min_phrase_tokens: number
        max_phrase_tokens: number
      }
      const literalTokens = [...new Set(
        tokenized.flat(2).filter(token =>
          token !== "§" &&
          token !== "？" &&
          !/^[a-zａ-ｚ]$/u.test(token)
        ),
      )]
      const literals = literalTokens.map(token => ({
        token,
        ...(decompositionStats.get(token) as {
          count: number
          min_tokens: number | null
          max_tokens: number | null
        }),
      }))
      return {
        ...entry,
        patternUtf8Bytes: Buffer.byteLength(row.pattern, "utf8"),
        phraseCount: row.phrase_count,
        minPhraseTokens: row.min_phrase_tokens,
        maxPhraseTokens: row.max_phrase_tokens,
        literals,
      }
    })
    const payload = {
      formatVersion: 1,
      caseSetVersion: manifest.caseSetVersion,
      manifestPath: options.manifestPath,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      databasePath: dbPath,
      results,
    }
    const json = JSON.stringify(payload, null, 2) + "\n"
    if (options.outputPath) writeFileSync(options.outputPath, json)
    process.stdout.write(json)
  } finally {
    db.close()
  }
}

main()
