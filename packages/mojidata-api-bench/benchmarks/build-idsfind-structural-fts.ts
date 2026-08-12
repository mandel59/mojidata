import { performance } from "node:perf_hooks"
import {
  copyFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import { dirname, resolve } from "node:path"

import Database from "better-sqlite3"

import {
  collectIdsFtsFeatures,
  idsFtsFeatureVersion,
  type IdsFtsFeatureFamily,
} from "@mandel59/idsdb-utils"

type Options = {
  basePath: string
  outputPath: string
  families: IdsFtsFeatureFamily[]
}

const repositoryRoot = resolve(__dirname, "../../..")

function parseArgs(argv: string[]): Options {
  let basePath = "packages/idsdb-fts5/idsfind.db"
  let outputPath: string | undefined
  let families: IdsFtsFeatureFamily[] = ["root", "edge"]
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--base":
        basePath = argv[++index]
        break
      case "--output":
        outputPath = argv[++index]
        break
      case "--features": {
        const values = argv[++index]?.split(",") ?? []
        if (
          values.length === 0 ||
          values.some(value => value !== "root" && value !== "edge")
        ) {
          throw new Error("--features must be a comma-separated subset of root,edge")
        }
        families = [...new Set(values)] as IdsFtsFeatureFamily[]
        break
      }
      case "--help":
      case "-h":
        console.log(
          "Usage: yarn bench:build-idsfind-structural --output <variant.db> " +
            "[--base <idsfind.db>] [--features root,edge]",
        )
        process.exit(0)
      default:
        throw new Error("Unknown argument: " + argv[index])
    }
  }
  if (!outputPath) {
    throw new Error("--output is required")
  }
  const resolvedBase = resolve(repositoryRoot, basePath)
  const resolvedOutput = resolve(repositoryRoot, outputPath)
  if (resolvedBase === resolvedOutput) {
    throw new Error("--output must differ from --base")
  }
  return { basePath: resolvedBase, outputPath: resolvedOutput, families }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  mkdirSync(dirname(options.outputPath), { recursive: true })
  const temporaryPath = options.outputPath + ".tmp-" + process.pid
  rmSync(temporaryPath, { force: true })

  const startedAt = performance.now()
  copyFileSync(options.basePath, temporaryPath)
  const copiedAt = performance.now()
  let ucsCount = 0
  let featureCount = 0
  try {
    const db = new Database(temporaryPath)
    try {
      db.exec(`
      DROP TABLE IF EXISTS idsfind_structural_fts;
      DROP TABLE IF EXISTS idsfind_structural_meta;
      CREATE VIRTUAL TABLE idsfind_structural_fts USING fts5 (
        IDS_features,
        content='',
        tokenize='unicode61'
      );
      CREATE TABLE idsfind_structural_meta (
        schema_version INTEGER PRIMARY KEY CHECK (schema_version = 1),
        feature_version TEXT NOT NULL,
        families TEXT NOT NULL,
        base_path TEXT NOT NULL,
        ucs_count INTEGER NOT NULL,
        feature_count INTEGER NOT NULL
      );
    `)
      const insert = db.prepare(
      "INSERT INTO idsfind_structural_fts (rowid, IDS_features) VALUES (?, ?)",
    )
      const rows = db.prepare(
      "SELECT rowid, UCS, IDS_tokens FROM idsfind ORDER BY UCS, rowid",
    ).all() as { rowid: number; UCS: string; IDS_tokens: string }[]

      db.transaction(() => {
      let currentUcs: string | undefined
      let currentRowid = 0
      let features = new Set<string>()
      const flush = () => {
        if (currentUcs === undefined) return
        insert.run(currentRowid, [...features].join(" "))
        ucsCount++
        featureCount += features.size
      }
      for (const row of rows) {
        if (row.UCS !== currentUcs) {
          flush()
          currentUcs = row.UCS
          currentRowid = row.rowid
          features = new Set()
        }
        for (
          const feature of collectIdsFtsFeatures(
            row.IDS_tokens.split(" "),
            { families: options.families },
          )
        ) {
          features.add(feature)
        }
      }
      flush()
      })()
      db.prepare(
      "INSERT INTO idsfind_structural_meta VALUES (1, ?, ?, ?, ?, ?)",
      ).run(
      idsFtsFeatureVersion,
      options.families.join(","),
      options.basePath,
      ucsCount,
      featureCount,
    )
      db.exec("INSERT INTO idsfind_structural_fts(idsfind_structural_fts) VALUES ('optimize')")
    } finally {
      db.close()
    }
    renameSync(temporaryPath, options.outputPath)
  } catch (error) {
    rmSync(temporaryPath, { force: true })
    throw error
  }
  const finishedAt = performance.now()
  console.log(JSON.stringify({
    basePath: options.basePath,
    outputPath: options.outputPath,
    families: options.families,
    baseBytes: statSync(options.basePath).size,
    outputBytes: statSync(options.outputPath).size,
    copyMs: copiedAt - startedAt,
    structuralBuildMs: finishedAt - copiedAt,
    totalMs: finishedAt - startedAt,
    ucsCount,
    featureCount,
  }, null, 2))
}

main()
