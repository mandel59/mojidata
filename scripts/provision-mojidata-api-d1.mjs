import assert from "node:assert/strict"
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
  console.log(`Usage: node ./scripts/provision-mojidata-api-d1.mjs [--config path] [--location wnam]

Ensures the D1 databases referenced by the mojidata-api D1 worker exist and
updates wrangler.jsonc with their database IDs.`)
}

function parseArgs(argv) {
  let configPath = defaultConfigPath
  let location

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--config") {
      configPath = path.resolve(argv[++i])
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

  return { configPath, location }
}

function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""))
}

function readConfig(configPath) {
  const text = fs.readFileSync(configPath, "utf8")
  const json = parseJsonc(text)
  assert.ok(Array.isArray(json.d1_databases), "wrangler config must define d1_databases")
  return json
}

function writeConfig(configPath, config) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

function runWrangler(args, cwd) {
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

function getDatabaseIdFromInfo(databaseName, cwd) {
  try {
    const stdout = runWrangler(["d1", "info", databaseName, "--json"], cwd)
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

function createDatabase({ binding, databaseName, cwd, location }) {
  const args = ["d1", "create", databaseName, "--binding", binding]
  if (location) args.push("--location", location)
  const stdout = runWrangler(args, cwd)
  const databaseId = findFirstUuid(stdout)
  if (!databaseId) {
    throw new Error(`Could not parse database ID from wrangler output for ${databaseName}`)
  }
  return databaseId
}

async function main() {
  const { configPath, location } = parseArgs(process.argv.slice(2))
  const cwd = path.dirname(configPath)
  const config = readConfig(configPath)

  const nextDatabases = []
  for (const entry of config.d1_databases) {
    assert.equal(typeof entry.binding, "string")
    assert.equal(typeof entry.database_name, "string")

    let databaseId = getDatabaseIdFromInfo(entry.database_name, cwd)
    let action = "reused"
    if (!databaseId) {
      databaseId = createDatabase({
        binding: entry.binding,
        databaseName: entry.database_name,
        cwd,
        location,
      })
      action = "created"
    }

    nextDatabases.push({
      ...entry,
      database_id: databaseId,
    })
    console.log(`${action} ${entry.binding}: ${entry.database_name} (${databaseId})`)
  }

  config.d1_databases = nextDatabases
  writeConfig(configPath, config)
  console.log(`updated ${configPath}`)
}

await main()
