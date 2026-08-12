import { copyFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

import Database from "better-sqlite3"

const repositoryRoot = resolve(__dirname, "../../..")

function parseArgs(argv: string[]) {
  let basePath = "packages/idsdb-fts5/idsfind.db"
  let outputPath: string | undefined
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--base":
        basePath = argv[++index]
        break
      case "--output":
        outputPath = argv[++index]
        break
      default:
        throw new Error("Unknown argument: " + argv[index])
    }
  }
  if (!outputPath) throw new Error("--output is required")
  return {
    basePath: resolve(repositoryRoot, basePath),
    outputPath: resolve(repositoryRoot, outputPath),
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.basePath === options.outputPath) {
    throw new Error("--output must differ from --base")
  }
  mkdirSync(dirname(options.outputPath), { recursive: true })
  const temporaryPath = options.outputPath + ".tmp-" + process.pid
  rmSync(temporaryPath, { force: true })
  const startedAt = performance.now()
  try {
    copyFileSync(options.basePath, temporaryPath)
    const db = new Database(temporaryPath)
    try {
      db.pragma("journal_mode = delete")
      db.exec("CREATE INDEX idsfind_IDS_tokens ON idsfind (IDS_tokens)")
      db.exec("ANALYZE idsfind_IDS_tokens")
    } finally {
      db.close()
    }
    renameSync(temporaryPath, options.outputPath)
  } catch (error) {
    rmSync(temporaryPath, { force: true })
    throw error
  }
  console.log(JSON.stringify({
    basePath: options.basePath,
    outputPath: options.outputPath,
    baseBytes: statSync(options.basePath).size,
    outputBytes: statSync(options.outputPath).size,
    elapsedMs: performance.now() - startedAt,
  }, null, 2))
}

main()
