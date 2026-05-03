import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const rootDir = path.resolve(new URL("..", import.meta.url).pathname)
const defaultConfigPath = path.join(
  rootDir,
  "packages",
  "mojidata-api-d1-worker",
  "wrangler.jsonc",
)
const controlPlaneCwd = rootDir

function printUsage() {
  console.log(`Usage: node ./scripts/create-mojidata-api-d1-release.mjs [--config path] [--env production] [--release 20260503-unihan-ref] [--manifest /tmp/mojidata-api-d1-release.json] [--location wnam]

Creates a fresh pair of D1 databases for a blue/green mojidata-api release and
writes a release manifest. The active wrangler config is not changed.`)
}

function parseArgs(argv) {
  let configPath = defaultConfigPath
  let env
  let release = defaultReleaseLabel()
  let manifestPath
  let location

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
    if (arg === "--release") {
      release = argv[++i]
      continue
    }
    if (arg === "--manifest") {
      manifestPath = path.resolve(argv[++i])
      continue
    }
    if (arg === "--location") {
      location = argv[++i]
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  validateReleaseLabel(release)
  manifestPath ??= path.join(
    os.tmpdir(),
    `mojidata-api-d1-release-${release}.json`,
  )

  return { configPath, env, release, manifestPath, location }
}

function defaultReleaseLabel() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14)
  return `r${timestamp}`
}

function validateReleaseLabel(release) {
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(release)) {
    throw new Error(
      "--release must start with a lowercase letter or digit and contain only lowercase letters, digits, or hyphens",
    )
  }
}

function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""))
}

function readConfig(configPath) {
  return parseJsonc(fs.readFileSync(configPath, "utf8"))
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

function runWrangler(args, cwd = controlPlaneCwd) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n")
    throw new Error(`wrangler ${args.join(" ")} failed\n${output}`)
  }
  return result.stdout
}

function findFirstUuid(value) {
  const uuidPattern =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

  if (typeof value === "string") {
    return value.match(uuidPattern)?.[0]
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstUuid(item)
      if (match) return match
    }
    return undefined
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const match = findFirstUuid(item)
      if (match) return match
    }
  }
  return undefined
}

function listDatabases() {
  const stdout = runWrangler(["d1", "list", "--json"])
  const json = JSON.parse(stdout)
  return Array.isArray(json) ? json : []
}

function getDatabaseIdFromInfo(databaseName) {
  try {
    const stdout = runWrangler(["d1", "info", databaseName, "--json"])
    return findFirstUuid(JSON.parse(stdout))
  } catch (error) {
    const message = String(error)
    if (
      message.includes("Couldn't find DB") ||
      message.includes("does not exist") ||
      message.includes("Not Found")
    ) {
      return undefined
    }
    throw error
  }
}

function createDatabase({ binding, databaseName, location }) {
  const args = ["d1", "create", databaseName, "--binding", binding]
  if (location) args.push("--location", location)
  const stdout = runWrangler(args)
  const databaseId = findFirstUuid(stdout)
  if (!databaseId) {
    throw new Error(
      `Could not parse database ID from wrangler output for ${databaseName}`,
    )
  }
  return databaseId
}

function copyD1Entry(entry) {
  assert.equal(typeof entry.binding, "string")
  assert.equal(typeof entry.database_name, "string")
  return { ...entry }
}

function makeReleaseDatabaseName(databaseName, release) {
  return `${databaseName}-${release}`
}

async function main() {
  const { configPath, env, release, manifestPath, location } = parseArgs(
    process.argv.slice(2),
  )
  const config = readConfig(configPath)
  const configTarget = getConfigTarget(config, env)
  const previousDatabases = configTarget.d1_databases.map(copyD1Entry)
  const previousByBinding = new Map(
    previousDatabases.map((entry) => [entry.binding, entry]),
  )

  for (const binding of ["MOJIDATA_DB", "IDSFIND_DB"]) {
    if (!previousByBinding.has(binding)) {
      throw new Error(`wrangler config must define ${binding}`)
    }
  }

  const existingDatabases = listDatabases()
  const releaseDatabases = []
  for (const entry of previousDatabases) {
    const databaseName = makeReleaseDatabaseName(entry.database_name, release)
    let databaseId =
      existingDatabases.find((item) => item?.name === databaseName)?.uuid ??
      getDatabaseIdFromInfo(databaseName)
    let action = "reused"
    if (!databaseId) {
      databaseId = createDatabase({
        binding: entry.binding,
        databaseName,
        location,
      })
      action = "created"
    }

    releaseDatabases.push({
      ...entry,
      database_name: databaseName,
      database_id: databaseId,
    })
    console.log(`${action} ${entry.binding}: ${databaseName} (${databaseId})`)
  }

  const manifest = {
    kind: "mojidata-api-d1-blue-green-release",
    version: 1,
    release,
    createdAt: new Date().toISOString(),
    env: env ?? null,
    target: env ? `env.${env}` : "default",
    configPath,
    previousDatabases,
    releaseDatabases,
  }

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`wrote release manifest: ${manifestPath}`)
  console.log("wrangler config was not changed")
}

await main()
