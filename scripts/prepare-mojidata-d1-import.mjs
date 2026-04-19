import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const rootDir = path.resolve(import.meta.dirname, "..")

function parseArgs(argv) {
  let outputDir = path.join(os.tmpdir(), "mojidata-d1-import")
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--output-dir") {
      outputDir = argv[index + 1]
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return { outputDir: path.resolve(outputDir) }
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  })
}

function prepareWorkspace(name) {
  run("corepack", ["yarn", "workspace", name, "prepare"])
}

function dumpSqliteDatabase(dbPath) {
  return execFileSync("sqlite3", [dbPath, ".dump"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  })
}

function sanitizeDumpForD1(dumpText) {
  const lines = dumpText.replaceAll("\r\n", "\n").split("\n")
  const kept = []
  let skippingCfKv = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (skippingCfKv) {
      if (trimmed === ") WITHOUT ROWID;") {
        skippingCfKv = false
      }
      continue
    }

    if (trimmed === "BEGIN TRANSACTION;" || trimmed === "COMMIT;") {
      continue
    }

    if (trimmed === "CREATE TABLE _cf_KV (") {
      skippingCfKv = true
      continue
    }

    kept.push(line)
  }

  return `${kept.join("\n").trimEnd()}\n`
}

function writeDumpFile(sourceDbPath, outputPath) {
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`Missing SQLite database file: ${sourceDbPath}`)
  }
  const rawDump = dumpSqliteDatabase(sourceDbPath)
  const sanitized = sanitizeDumpForD1(rawDump)
  fs.writeFileSync(outputPath, sanitized)
}

function writeManifest(outputDir, entries) {
  const manifestPath = path.join(outputDir, "manifest.json")
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        entries,
      },
      null,
      2,
    )}\n`,
  )
}

function main() {
  const { outputDir } = parseArgs(process.argv.slice(2))

  prepareWorkspace("@mandel59/mojidata")
  prepareWorkspace("@mandel59/idsdb-fts5")

  fs.mkdirSync(outputDir, { recursive: true })

  const dumpTargets = [
    {
      name: "mojidata",
      sourceDbPath: path.join(rootDir, "packages/mojidata/dist/moji.db"),
      outputPath: path.join(outputDir, "mojidata.sql"),
    },
    {
      name: "idsdb-fts5",
      sourceDbPath: path.join(rootDir, "packages/idsdb-fts5/idsfind.db"),
      outputPath: path.join(outputDir, "idsdb-fts5.sql"),
    },
  ]

  for (const target of dumpTargets) {
    console.log(`Preparing D1 import dump for ${target.name}: ${target.outputPath}`)
    writeDumpFile(target.sourceDbPath, target.outputPath)
  }

  writeManifest(
    outputDir,
    dumpTargets.map(({ name, sourceDbPath, outputPath }) => ({
      name,
      sourceDbPath,
      outputPath,
    })),
  )

  console.log(`Wrote D1 import dumps to ${outputDir}`)
}

main()
