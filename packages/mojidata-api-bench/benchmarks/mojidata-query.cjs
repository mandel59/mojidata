"use strict"

const {
  createBvecIdsfindCandidateProvider,
  createIdsfind,
  ftsIdsfindCandidateProvider,
} = require("@mandel59/mojidata-api-core")
const {
  createBetterSqlite3ExecutorProvider,
} = require("@mandel59/mojidata-api-better-sqlite3")

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("arguments must be --name value pairs")
    }
    values.set(name, value)
  }
  const required = name => {
    const value = values.get(name)
    if (!value) throw new Error(`${name} is required`)
    return value
  }
  const provider = required("--provider")
  if (provider !== "fts" && provider !== "bvec") {
    throw new Error(`unsupported --provider: ${provider}`)
  }
  const query = JSON.parse(required("--query-json"))
  if (!Array.isArray(query) || query.some(value => typeof value !== "string")) {
    throw new Error("--query-json must encode a string array")
  }
  return {
    dbPath: required("--db"),
    provider,
    query,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const provider = options.provider === "fts"
    ? ftsIdsfindCandidateProvider
    : createBvecIdsfindCandidateProvider()
  const idsfind = createIdsfind(
    createBetterSqlite3ExecutorProvider(options.dbPath),
    provider,
  )
  const results = [...new Set(await idsfind(options.query))].sort()
  process.stdout.write(JSON.stringify(results) + "\n")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
