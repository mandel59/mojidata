import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

type Options = {
  outputDir: string
  forwardedArgs: string[]
}

type LocalBackend = {
  name: "sqljs" | "better-sqlite3" | "node:sqlite"
  outputFile: string
}

type ComparisonSpec = {
  baseline: LocalBackend
  candidate: LocalBackend
  slug: string
  legacyAlias?: boolean
}

const localBackends: LocalBackend[] = [
  { name: "sqljs", outputFile: "sqljs.json" },
  { name: "better-sqlite3", outputFile: "better-sqlite3.json" },
  { name: "node:sqlite", outputFile: "node-sqlite.json" },
]

const comparisons: ComparisonSpec[] = [
  {
    baseline: localBackends[0],
    candidate: localBackends[1],
    slug: "sqljs-vs-better-sqlite3",
    legacyAlias: true,
  },
  {
    baseline: localBackends[0],
    candidate: localBackends[2],
    slug: "sqljs-vs-node-sqlite",
  },
  {
    baseline: localBackends[1],
    candidate: localBackends[2],
    slug: "better-sqlite3-vs-node-sqlite",
  },
]

function parseArgs(argv: string[]): Options {
  const forwardedArgs: string[] = []
  let outputDir = "artifacts/local"

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--output-dir":
        outputDir = argv[++index] ?? outputDir
        break
      case "--help":
      case "-h":
        printHelp()
        process.exit(0)
      default:
        forwardedArgs.push(arg)
        break
    }
  }

  return { outputDir, forwardedArgs }
}

function printHelp() {
  console.log(`Usage: yarn bench:local [options] [-- <bench options>]

Options:
  --output-dir <path>  Directory for saved benchmark outputs (default: artifacts/local)
  --help               Show this help

Additional arguments are forwarded to all local backend benchmark runs. Example:
  yarn bench:local --output-dir ../../tmp/bench -- --scenario ivs-list --iterations 10`)
}

function runNodeScript(
  scriptPath: string,
  args: string[],
  options?: { captureStdout?: boolean },
) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", scriptPath, ...args],
    {
      cwd: process.cwd(),
      stdio: options?.captureStdout ? "pipe" : "inherit",
      encoding: "utf8",
    },
  )

  if ((result.status ?? 1) !== 0) {
    if (options?.captureStdout) {
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
    }
    process.exit(result.status ?? 1)
  }

  return result.stdout ?? ""
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const benchmarksDir = __dirname
  const runScript = path.join(benchmarksDir, "run.ts")
  const compareScript = path.join(benchmarksDir, "compare.ts")
  const outputDir = path.resolve(process.cwd(), options.outputDir)

  mkdirSync(outputDir, { recursive: true })

  const resultPaths = new Map(
    localBackends.map((backend) => [backend.name, path.join(outputDir, backend.outputFile)]),
  )

  for (const backend of localBackends) {
    runNodeScript(runScript, [
      "--backend",
      backend.name,
      "--output",
      resultPaths.get(backend.name)!,
      ...options.forwardedArgs,
    ])
  }

  for (const comparison of comparisons) {
    const baselinePath = resultPaths.get(comparison.baseline.name)!
    const candidatePath = resultPaths.get(comparison.candidate.name)!
    const compareText = runNodeScript(
      compareScript,
      [baselinePath, candidatePath],
      { captureStdout: true },
    )
    process.stdout.write(`\n# ${comparison.slug}\n`)
    process.stdout.write(compareText)

    const textPath = path.join(outputDir, `compare-${comparison.slug}.txt`)
    const jsonPath = path.join(outputDir, `compare-${comparison.slug}.json`)
    writeFileSync(textPath, compareText)

    const compareJson = runNodeScript(
      compareScript,
      ["--format", "json", baselinePath, candidatePath],
      { captureStdout: true },
    )
    writeFileSync(jsonPath, compareJson)

    if (comparison.legacyAlias) {
      writeFileSync(path.join(outputDir, "compare.txt"), compareText)
      writeFileSync(path.join(outputDir, "compare.json"), compareJson)
    }
  }

  console.error(`Saved local benchmark outputs to ${outputDir}`)
}

main()
