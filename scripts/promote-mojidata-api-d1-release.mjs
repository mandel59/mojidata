import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const defaultConfigPath = path.join(
  rootDir,
  "packages",
  "mojidata-api-d1-worker",
  "wrangler.jsonc",
)

function printUsage() {
  console.log(`Usage: node ./scripts/promote-mojidata-api-d1-release.mjs --release-manifest /tmp/mojidata-api-d1-release.json [--config path] [--env production] [--rollback-manifest /tmp/mojidata-api-d1-rollback.json] [--binding MOJIDATA_DB] [--force]

Promotes D1 databases in a blue/green release manifest by writing their IDs into
wrangler.jsonc. Pass --binding one or more times to promote only selected
bindings. It also writes a rollback manifest for the previously active
databases. Deploy the Worker after reviewing the config diff.`)
}

function parseArgs(argv) {
  let configPath = defaultConfigPath
  let env
  let releaseManifestPath
  let rollbackManifestPath
  let force = false
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
    if (arg === "--release-manifest") {
      releaseManifestPath = path.resolve(argv[++i])
      continue
    }
    if (arg === "--rollback-manifest") {
      rollbackManifestPath = path.resolve(argv[++i])
      continue
    }
    if (arg === "--force") {
      force = true
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

  if (!releaseManifestPath) {
    throw new Error("--release-manifest is required")
  }

  return {
    configPath,
    env,
    releaseManifestPath,
    rollbackManifestPath,
    force,
    bindings,
  }
}

function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""))
}

function readConfig(configPath) {
  return parseJsonc(fs.readFileSync(configPath, "utf8"))
}

function writeConfig(configPath, config) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

function readManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  if (manifest.kind !== "mojidata-api-d1-blue-green-release") {
    throw new Error(
      `release manifest must have kind mojidata-api-d1-blue-green-release: ${manifestPath}`,
    )
  }
  if (!Array.isArray(manifest.releaseDatabases)) {
    throw new Error("release manifest must define releaseDatabases")
  }
  if (!Array.isArray(manifest.previousDatabases)) {
    throw new Error("release manifest must define previousDatabases")
  }
  return manifest
}

function getConfigTarget(config, env) {
  const target = env ? config.env?.[env] : config
  assert.ok(target, `wrangler config must define env.${env}`)
  assert.ok(
    Array.isArray(target.d1_databases),
    env
      ? `wrangler config must define env.${env}.d1_databases`
      : "wrangler config must define d1_databases",
  )
  return target
}

function copyD1Entry(entry) {
  assert.equal(typeof entry.binding, "string")
  assert.equal(typeof entry.database_name, "string")
  assert.equal(typeof entry.database_id, "string")
  return { ...entry }
}

function normalizeDatabases(databases) {
  return databases
    .map((entry) => ({
      binding: entry.binding,
      database_name: entry.database_name,
      database_id: entry.database_id,
    }))
    .sort((a, b) => a.binding.localeCompare(b.binding))
}

function selectDatabases(databases, bindings) {
  const selected = new Set(bindings)
  return databases.filter((entry) => selected.has(entry.binding))
}

function sameDatabases(left, right) {
  return (
    JSON.stringify(normalizeDatabases(left)) ===
    JSON.stringify(normalizeDatabases(right))
  )
}

function ensureBindings(databases, bindings, label) {
  const byBinding = new Map(databases.map((entry) => [entry.binding, entry]))
  for (const binding of bindings) {
    if (!byBinding.has(binding)) {
      throw new Error(`${label} must define ${binding}`)
    }
  }
}

function replaceDatabases(currentDatabases, releaseDatabases) {
  const releaseByBinding = new Map(
    releaseDatabases.map((entry) => [entry.binding, entry]),
  )
  const seen = new Set()
  const nextDatabases = currentDatabases.map((entry) => {
    const releaseEntry = releaseByBinding.get(entry.binding)
    if (!releaseEntry) {
      return entry
    }
    seen.add(entry.binding)
    return {
      ...entry,
      ...releaseEntry,
    }
  })

  for (const entry of releaseDatabases) {
    if (!seen.has(entry.binding)) {
      nextDatabases.push(entry)
    }
  }

  return nextDatabases
}

function defaultRollbackManifestPath(release) {
  const label = release || new Date().toISOString().replace(/\D/g, "").slice(0, 14)
  return path.join(os.tmpdir(), `mojidata-api-d1-rollback-${label}.json`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifest = readManifest(args.releaseManifestPath)
  const manifestEnv = manifest.env ?? undefined
  const env = args.env ?? manifestEnv

  if (args.env !== undefined && manifestEnv !== undefined && args.env !== manifestEnv) {
    throw new Error(
      `--env ${args.env} does not match release manifest env ${manifestEnv}`,
    )
  }
  if (args.env !== undefined && manifestEnv === undefined) {
    throw new Error("--env was provided but the release manifest targets default")
  }

  const config = readConfig(args.configPath)
  const configTarget = getConfigTarget(config, env)
  const currentDatabases = configTarget.d1_databases.map(copyD1Entry)
  const previousDatabases = manifest.previousDatabases.map(copyD1Entry)
  const releaseDatabases = manifest.releaseDatabases.map(copyD1Entry)
  const selectedBindings =
    args.bindings.length > 0
      ? [...new Set(args.bindings)]
      : (manifest.selectedBindings ?? releaseDatabases.map((entry) => entry.binding))
  ensureBindings(previousDatabases, selectedBindings, "release manifest previousDatabases")
  ensureBindings(releaseDatabases, selectedBindings, "release manifest releaseDatabases")
  ensureBindings(currentDatabases, selectedBindings, "wrangler config")

  if (
    !args.force &&
    !sameDatabases(
      selectDatabases(currentDatabases, selectedBindings),
      selectDatabases(previousDatabases, selectedBindings),
    )
  ) {
    throw new Error(
      "current wrangler config does not match selected release manifest previousDatabases; refusing stale promotion. Pass --force if this is intentional.",
    )
  }

  configTarget.d1_databases = replaceDatabases(
    configTarget.d1_databases,
    selectDatabases(releaseDatabases, selectedBindings),
  )
  writeConfig(args.configPath, config)

  const rollbackManifestPath =
    args.rollbackManifestPath ?? defaultRollbackManifestPath(manifest.release)
  const rollbackManifest = {
    kind: "mojidata-api-d1-blue-green-release",
    version: 1,
    release: `rollback-${manifest.release ?? "manual"}`,
    createdAt: new Date().toISOString(),
    env: env ?? null,
    target: env ? `env.${env}` : "default",
    configPath: args.configPath,
    rollbackOf: manifest.release ?? null,
    selectedBindings,
    unchangedDatabases: currentDatabases.filter(
      (entry) => !selectedBindings.includes(entry.binding),
    ),
    previousDatabases: configTarget.d1_databases.map(copyD1Entry),
    releaseDatabases: currentDatabases,
  }

  fs.mkdirSync(path.dirname(rollbackManifestPath), { recursive: true })
  fs.writeFileSync(
    rollbackManifestPath,
    `${JSON.stringify(rollbackManifest, null, 2)}\n`,
  )

  console.log(`updated ${args.configPath}${env ? ` env.${env}` : ""}`)
  console.log(`wrote rollback manifest: ${rollbackManifestPath}`)
  console.log("review the config diff, then deploy the Worker to promote traffic")
}

await main()
