import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import { resolve } from "node:path"
import Database from "better-sqlite3"

type Options = {
  idsgrepPath: string
  eidsPath: string
  recipePath: string
  workDirectory: string
  outputPath?: string
  repetitions: number
}

type TimeMeasurement = {
  wallMilliseconds: number
  peakRssKibibytes: number
}

type DatabaseObject = {
  name: string
  bytes: number
}

function parseArgs(argv: string[]): Options {
  if (argv[0] === "--") argv = argv.slice(1)
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("arguments must be --name value pairs")
    }
    values.set(name, value)
  }
  const required = (name: string) => {
    const value = values.get(name)
    if (!value) throw new Error(`${name} is required`)
    return resolve(value)
  }
  const repetitions = Number.parseInt(values.get("--repetitions") ?? "3", 10)
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("--repetitions must be a positive integer")
  }
  return {
    idsgrepPath: required("--idsgrep"),
    eidsPath: required("--eids"),
    recipePath: required("--recipe"),
    workDirectory: required("--work-dir"),
    outputPath: values.get("--output")
      ? resolve(values.get("--output") as string)
      : undefined,
    repetitions,
  }
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function parseElapsedSeconds(value: string) {
  const fields = value.split(":").map(Number)
  if (fields.some(field => !Number.isFinite(field)) || fields.length > 3) {
    throw new Error(`invalid elapsed time: ${value}`)
  }
  return fields.reduce((total, field) => total * 60 + field, 0)
}

function parseTimeOutput(path: string): TimeMeasurement {
  const lines = readFileSync(path, "utf8").split("\n")
  const elapsedLine = lines.find(line => line.includes("Elapsed (wall clock) time"))
  const rssLine = lines.find(line => line.includes("Maximum resident set size"))
  if (!elapsedLine || !rssLine) {
    throw new Error(`GNU time output is incomplete: ${path}`)
  }
  const elapsed = elapsedLine.slice(elapsedLine.lastIndexOf(": ") + 2).trim()
  const peakRssKibibytes = Number(rssLine.slice(rssLine.lastIndexOf(": ") + 2).trim())
  if (!Number.isSafeInteger(peakRssKibibytes) || peakRssKibibytes < 0) {
    throw new Error(`invalid peak RSS in ${path}`)
  }
  return {
    wallMilliseconds: parseElapsedSeconds(elapsed) * 1000,
    peakRssKibibytes,
  }
}

function runTimed(
  command: string,
  args: string[],
  timeOutputPath: string,
  options: { cwd?: string; captureStdout?: boolean; env?: NodeJS.ProcessEnv } = {},
) {
  return execFileSync("/usr/bin/time", [
    "-v", "-o", timeOutputPath, command, ...args,
  ], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
      LANG: "C",
      LC_ALL: "C",
    },
    maxBuffer: 128 * 1024 * 1024,
    stdio: options.captureStdout
      ? ["ignore", "pipe", "pipe"]
      : ["ignore", "ignore", "inherit"],
  })
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function databaseStats(path: string, mode: "fts5" | "bvec") {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  try {
    const integrity = db.pragma("integrity_check", { simple: true })
    if (integrity !== "ok") throw new Error(`${path}: integrity_check=${integrity}`)
    const objects = db.prepare(
      "SELECT name, sum(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY name",
    ).all() as DatabaseObject[]
    const isScopedIndexObject = mode === "fts5"
      ? (name: string) => name === "idsfind_ref" || name.startsWith("idsfind_fts_")
      : (name: string) => name.includes("idsfind_bvec")
    const indexObjects = objects.filter(object => isScopedIndexObject(object.name))
    const semantics = db.prepare(
      "SELECT schema_version, semantics_mode, semantics_profile, recipe_sha256 " +
      "FROM idsfind_semantics",
    ).get()
    return {
      fileBytes: statSync(path).size,
      sha256: sha256File(path),
      rowCount: (db.prepare("SELECT count(*) AS count FROM idsfind").get() as { count: number }).count,
      semantics,
      objects,
      scopedIndexDefinition: mode === "fts5"
        ? "dbstat objects idsfind_ref and idsfind_fts_*; excludes shared corpus tables"
        : "dbstat objects whose names contain idsfind_bvec; excludes shared corpus tables",
      scopedIndexObjects: indexObjects,
      scopedIndexBytes: indexObjects.reduce((sum, object) => sum + object.bytes, 0),
    }
  } finally {
    db.close()
  }
}

function summarizeRepetitions<T extends TimeMeasurement>(repetitions: T[]) {
  return {
    repetitions,
    medianWallMilliseconds: median(repetitions.map(item => item.wallMilliseconds)),
    medianPeakRssKibibytes: median(repetitions.map(item => item.peakRssKibibytes)),
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const repositoryRoot = resolve(__dirname, "../../..")
  mkdirSync(options.workDirectory, { recursive: true })

  const buildResults = {} as Record<"fts5" | "bvec", ReturnType<typeof summarizeRepetitions>>
  for (const mode of ["fts5", "bvec"] as const) {
    const repetitions = []
    for (let repetition = 1; repetition <= options.repetitions; repetition++) {
      const outputDirectory = resolve(options.workDirectory, `${mode}-r${repetition}`)
      if (existsSync(outputDirectory)) {
        throw new Error(`refusing to overwrite existing measurement: ${outputDirectory}`)
      }
      mkdirSync(outputDirectory)
      const timePath = resolve(outputDirectory, "time.txt")
      runTimed("yarn", [
        "workspace",
        "@mandel59/idsdb",
        "prepare",
      ], timePath, {
        cwd: repositoryRoot,
        env: {
          MOJIDATA_IDSDB_BASE_DIR: repositoryRoot,
          MOJIDATA_IDSDB_RECIPE: options.recipePath,
          MOJIDATA_IDSDB_OUT_DIR: outputDirectory,
          MOJIDATA_IDSDB_INDEX_MODE: mode,
        },
      })
      const dbPath = resolve(outputDirectory, "idsfind.db")
      repetitions.push({
        repetition,
        ...parseTimeOutput(timePath),
        database: databaseStats(dbPath, mode),
      })
    }
    buildResults[mode] = summarizeRepetitions(repetitions)
  }

  const idsgrepRepetitions = []
  for (let repetition = 1; repetition <= options.repetitions; repetition++) {
    const outputDirectory = resolve(options.workDirectory, `idsgrep-r${repetition}`)
    if (existsSync(outputDirectory)) {
      throw new Error(`refusing to overwrite existing measurement: ${outputDirectory}`)
    }
    mkdirSync(outputDirectory)
    const timePath = resolve(outputDirectory, "time.txt")
    const output = runTimed(
      options.idsgrepPath,
      ["-G", options.eidsPath],
      timePath,
      { captureStdout: true },
    )
    const indexPath = resolve(outputDirectory, "parity.bvec")
    writeFileSync(indexPath, output)
    idsgrepRepetitions.push({
      repetition,
      ...parseTimeOutput(timePath),
      indexBytes: statSync(indexPath).size,
      sha256: sha256File(indexPath),
    })
  }

  const result = {
    formatVersion: 1,
    protocol: {
      repetitions: options.repetitions,
      summaryStatistic: "median",
      timer: "/usr/bin/time -v",
      buildScope: "full yarn workspace @mandel59/idsdb prepare from fixed projected records recipe; EIDS projection is excluded",
      rssUnit: "KiB as reported by GNU time",
      idsGrepSizeScope: "complete -G output (.bvec), which is an index-only sidecar",
    },
    environment: {
      platform: process.platform,
      release: os.release(),
      architecture: process.arch,
      cpu: os.cpus()[0]?.model,
      node: process.version,
      idsgrepVersion: execFileSync(options.idsgrepPath, ["-V"], { encoding: "utf8" }).trim(),
      mojidataRevision: execFileSync(
        "jj",
        ["log", "-r", "@-", "--no-graph", "-T", "commit_id"],
        { cwd: repositoryRoot, encoding: "utf8" },
      ).trim(),
    },
    inputs: {
      eids: {
        path: options.eidsPath,
        bytes: statSync(options.eidsPath).size,
        sha256: sha256File(options.eidsPath),
      },
      recipe: {
        path: options.recipePath,
        bytes: statSync(options.recipePath).size,
        sha256: sha256File(options.recipePath),
      },
    },
    targets: {
      mojidataFts5: buildResults.fts5,
      mojidataBvec128: buildResults.bvec,
      idsgrep: summarizeRepetitions(idsgrepRepetitions),
    },
  }
  const json = JSON.stringify(result, null, 2) + "\n"
  if (options.outputPath) writeFileSync(options.outputPath, json)
  process.stdout.write(json)
}

main()
