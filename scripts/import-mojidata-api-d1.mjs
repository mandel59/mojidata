import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const rootDir = path.resolve(new URL("..", import.meta.url).pathname)
const defaultConfigPath = path.join(
  rootDir,
  "packages",
  "mojidata-api-d1-worker",
  "wrangler.jsonc",
)

function printUsage() {
  console.log(`Usage: node ./scripts/import-mojidata-api-d1.mjs [--config path] [--output-dir /tmp/mojidata-d1-import] [--skip-prepare]

Prepares SQL dumps if needed and imports mojidata / idsfind data into the D1
databases referenced by the mojidata-api D1 worker config.`)
}

function parseArgs(argv) {
  let configPath = defaultConfigPath
  let outputDir = "/tmp/mojidata-d1-import"
  let skipPrepare = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--config") {
      configPath = path.resolve(argv[++i])
      continue
    }
    if (arg === "--output-dir") {
      outputDir = path.resolve(argv[++i])
      continue
    }
    if (arg === "--skip-prepare") {
      skipPrepare = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { configPath, outputDir, skipPrepare }
}

function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""))
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`)
  }
}

async function main() {
  const { configPath, outputDir, skipPrepare } = parseArgs(process.argv.slice(2))
  const cwd = path.dirname(configPath)
  const config = parseJsonc(fs.readFileSync(configPath, "utf8"))
  const byBinding = new Map(config.d1_databases.map((entry) => [entry.binding, entry]))

  const mojidataDb = byBinding.get("MOJIDATA_DB")
  const idsfindDb = byBinding.get("IDSFIND_DB")
  if (!mojidataDb || !idsfindDb) {
    throw new Error("wrangler config must define MOJIDATA_DB and IDSFIND_DB bindings")
  }

  if (!skipPrepare) {
    run("node", ["./scripts/prepare-mojidata-d1-import.mjs", "--output-dir", outputDir], rootDir)
  }

  const mojidataSql = path.join(outputDir, "mojidata.sql")
  const idsfindSql = path.join(outputDir, "idsdb-fts5.sql")
  if (!fs.existsSync(mojidataSql) || !fs.existsSync(idsfindSql)) {
    throw new Error(`expected SQL dumps in ${outputDir}`)
  }

  run("npx", ["wrangler", "d1", "execute", mojidataDb.database_name, "--remote", "--file", mojidataSql, "--yes"], cwd)
  run("npx", ["wrangler", "d1", "execute", idsfindDb.database_name, "--remote", "--file", idsfindSql, "--yes"], cwd)
}

await main()
