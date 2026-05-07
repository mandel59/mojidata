import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const npxCommand =
  process.platform === "win32"
    ? {
        command: process.execPath,
        args: [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js")],
      }
    : { command: "npx", args: [] }
const defaultConfigPath = path.join(
  rootDir,
  "packages",
  "mojidata-api-d1-worker",
  "wrangler.jsonc",
)

function printUsage() {
  console.log(`Usage: node ./scripts/import-mojidata-api-d1.mjs --release-manifest /tmp/mojidata-api-d1-release.json [--config path] [--output-dir /tmp/mojidata-d1-import] [--skip-prepare] [--binding MOJIDATA_DB]
       node ./scripts/import-mojidata-api-d1.mjs --unsafe-active [--config path] [--env staging] [--output-dir /tmp/mojidata-d1-import] [--skip-prepare] [--binding MOJIDATA_DB]

Prepares SQL dumps if needed and imports mojidata / idsfind data into the D1
databases in a blue/green release manifest. Pass --binding one or more times to
import only selected bindings.

Importing directly into active wrangler bindings is disabled by default because
it is not a zero-downtime operation.`)
}

function parseArgs(argv) {
  let configPath = defaultConfigPath
  let env
  let outputDir = "/tmp/mojidata-d1-import"
  let skipPrepare = false
  let releaseManifestPath
  let unsafeActive = false
  const bindings = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") {
      continue
    }
    if (arg === "--config") {
      configPath = path.resolve(argv[++i])
      continue
    }
    if (arg === "--env") {
      env = argv[++i]
      continue
    }
    if (arg === "--output-dir") {
      outputDir = path.resolve(argv[++i])
      continue
    }
    if (arg === "--release-manifest") {
      releaseManifestPath = path.resolve(argv[++i])
      continue
    }
    if (arg === "--skip-prepare") {
      skipPrepare = true
      continue
    }
    if (arg === "--unsafe-active") {
      unsafeActive = true
      continue
    }
    if (arg === "--binding") {
      bindings.push(argv[++i])
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (releaseManifestPath && unsafeActive) {
    throw new Error("--release-manifest and --unsafe-active cannot be combined")
  }

  return {
    configPath,
    env,
    outputDir,
    skipPrepare,
    releaseManifestPath,
    unsafeActive,
    bindings,
  }
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

function getConfigTarget(config, env) {
  const target = env ? config.env?.[env] : config
  if (!target) {
    throw new Error(`wrangler config must define env.${env}`)
  }
  if (!Array.isArray(target.d1_databases)) {
    throw new Error(
      env
        ? `wrangler config must define env.${env}.d1_databases`
        : "wrangler config must define d1_databases",
    )
  }
  return target
}

function readReleaseManifest(manifestPath, env) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  if (manifest.kind !== "mojidata-api-d1-blue-green-release") {
    throw new Error(
      `release manifest must have kind mojidata-api-d1-blue-green-release: ${manifestPath}`,
    )
  }
  if (!Array.isArray(manifest.releaseDatabases)) {
    throw new Error("release manifest must define releaseDatabases")
  }
  const manifestEnv = manifest.env ?? undefined
  if (env !== undefined && manifestEnv !== undefined && env !== manifestEnv) {
    throw new Error(`--env ${env} does not match release manifest env ${manifestEnv}`)
  }
  if (env !== undefined && manifestEnv === undefined) {
    throw new Error("--env was provided but the release manifest targets default")
  }
  return manifest
}

function getDatabasesByBinding(databases, bindings) {
  const byBinding = new Map(databases.map((entry) => [entry.binding, entry]))
  const selected = bindings.length > 0 ? bindings : ["MOJIDATA_DB", "IDSFIND_DB"]
  const deduped = [...new Set(selected)]
  for (const binding of deduped) {
    if (!byBinding.has(binding)) {
      throw new Error(`target must define ${binding} binding`)
    }
  }
  return deduped.map((binding) => byBinding.get(binding))
}

function getSqlPathForBinding(outputDir, binding) {
  if (binding === "MOJIDATA_DB") return path.join(outputDir, "mojidata.sql")
  if (binding === "IDSFIND_DB") return path.join(outputDir, "idsdb-fts5.sql")
  throw new Error(`no SQL dump mapping is defined for ${binding}`)
}

async function main() {
  const {
    configPath,
    env,
    outputDir,
    skipPrepare,
    releaseManifestPath,
    unsafeActive,
    bindings,
  } = parseArgs(process.argv.slice(2))
  const cwd = path.dirname(configPath)
  const config = parseJsonc(fs.readFileSync(configPath, "utf8"))
  let targetDatabases

  if (releaseManifestPath) {
    const manifest = readReleaseManifest(releaseManifestPath, env)
    targetDatabases = manifest.releaseDatabases
    if (bindings.length === 0 && Array.isArray(manifest.selectedBindings)) {
      bindings.push(...manifest.selectedBindings)
    }
    console.log(`importing into release manifest: ${releaseManifestPath}`)
  } else {
    if (!unsafeActive) {
      throw new Error(
        "refusing to import into active D1 bindings. Use --release-manifest for blue/green import, or --unsafe-active for one-off destructive testing.",
      )
    }
    const configTarget = getConfigTarget(config, env)
    targetDatabases = configTarget.d1_databases
    console.warn(
      "WARNING: importing into active D1 bindings. This is not a zero-downtime operation.",
    )
  }

  const selectedDatabases = getDatabasesByBinding(targetDatabases, bindings)

  if (!skipPrepare) {
    run("node", ["./scripts/prepare-mojidata-d1-import.mjs", "--output-dir", outputDir], rootDir)
  }

  for (const database of selectedDatabases) {
    const sqlPath = getSqlPathForBinding(outputDir, database.binding)
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`expected SQL dump for ${database.binding}: ${sqlPath}`)
    }
    run(
      npxCommand.command,
      [
        ...npxCommand.args,
        "wrangler",
        "d1",
        "execute",
        database.database_name,
        "--remote",
        "--file",
        sqlPath,
        "--yes",
      ],
      cwd,
    )
  }
}

await main()
