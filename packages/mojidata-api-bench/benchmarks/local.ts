import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

type Options = {
  outputDir: string
  forwardedArgs: string[]
}

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

Additional arguments are forwarded to both backend benchmark runs. Example:
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

  const sqljsPath = path.join(outputDir, "sqljs.json")
  const betterSqlite3Path = path.join(outputDir, "better-sqlite3.json")
  const compareTextPath = path.join(outputDir, "compare.txt")
  const compareJsonPath = path.join(outputDir, "compare.json")

  runNodeScript(runScript, [
    "--backend",
    "sqljs",
    "--output",
    sqljsPath,
    ...options.forwardedArgs,
  ])

  runNodeScript(runScript, [
    "--backend",
    "better-sqlite3",
    "--output",
    betterSqlite3Path,
    ...options.forwardedArgs,
  ])

  const compareText = runNodeScript(
    compareScript,
    [sqljsPath, betterSqlite3Path],
    { captureStdout: true },
  )
  process.stdout.write(compareText)
  writeFileSync(compareTextPath, compareText)

  const compareJson = runNodeScript(
    compareScript,
    ["--format", "json", sqljsPath, betterSqlite3Path],
    { captureStdout: true },
  )
  writeFileSync(compareJsonPath, compareJson)

  console.error(`Saved local benchmark outputs to ${outputDir}`)
}

main()
