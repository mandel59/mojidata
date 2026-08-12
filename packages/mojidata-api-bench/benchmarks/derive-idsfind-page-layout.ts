import { copyFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

import Database from "better-sqlite3"

const repositoryRoot = resolve(__dirname, "../../..")

function parseArgs(argv: string[]) {
  let basePath = "packages/idsdb-fts5/idsfind.db"
  let outputPath: string | undefined
  let pageSize: number | undefined
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--base":
        basePath = argv[++index]
        break
      case "--output":
        outputPath = argv[++index]
        break
      case "--page-size":
        pageSize = Number(argv[++index])
        break
      default:
        throw new Error("Unknown argument: " + argv[index])
    }
  }
  if (!outputPath || pageSize === undefined) {
    throw new Error("--output and --page-size are required")
  }
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 512 ||
    pageSize > 65536 ||
    (pageSize & (pageSize - 1)) !== 0
  ) {
    throw new Error("--page-size must be a power of two between 512 and 65536")
  }
  return {
    basePath: resolve(repositoryRoot, basePath),
    outputPath: resolve(repositoryRoot, outputPath),
    pageSize,
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
      db.pragma(`page_size = ${options.pageSize}`)
      db.exec("VACUUM")
      const actualPageSize = db.pragma("page_size", { simple: true })
      if (actualPageSize !== options.pageSize) {
        throw new Error(
          `Requested page size ${options.pageSize}, got ${actualPageSize}`,
        )
      }
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
    pageSize: options.pageSize,
    baseBytes: statSync(options.basePath).size,
    outputBytes: statSync(options.outputPath).size,
    elapsedMs: performance.now() - startedAt,
  }, null, 2))
}

main()
