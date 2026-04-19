import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

type Options = {
  baseUrl: string
  label: string
  outputDir: string
  forwardedArgs: string[]
}

type LocalBackend = {
  name: "sqljs" | "better-sqlite3" | "node:sqlite"
  outputFile: string
}

const localBackends: LocalBackend[] = [
  { name: "sqljs", outputFile: "sqljs.json" },
  { name: "better-sqlite3", outputFile: "better-sqlite3.json" },
  { name: "node:sqlite", outputFile: "node-sqlite.json" },
]

function parseArgs(argv: string[]): Options {
  const forwardedArgs: string[] = []
  let baseUrl = ""
  let label = "remote"
  let outputDir = "artifacts/remote"

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--base-url":
        baseUrl = argv[++index] ?? baseUrl
        break
      case "--label":
        label = argv[++index] ?? label
        break
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

  if (!baseUrl) {
    throw new Error("--base-url is required")
  }

  return { baseUrl, label, outputDir, forwardedArgs }
}

function printHelp() {
  console.log(`Usage: yarn bench:remote --base-url <url> [options] [-- <bench options>]

Options:
  --base-url <url>     Remote base URL to benchmark
  --label <label>      Label for the remote target (default: remote)
  --output-dir <path>  Directory for saved outputs (default: artifacts/remote)
  --help               Show this help

Additional arguments are forwarded to both local baseline runs and the remote run.

Example:
  yarn bench:remote \\
    --base-url https://example.com \\
    --label worker-d1 \\
    --output-dir ../../artifacts/worker-d1 \\
    -- --scenario idsfind-ids --iterations 10`)
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
  const remoteOutputPath = path.join(outputDir, `${options.label}.json`)

  for (const backend of localBackends) {
    runNodeScript(runScript, [
      "--backend",
      backend.name,
      "--output",
      resultPaths.get(backend.name)!,
      ...options.forwardedArgs,
    ])
  }

  runNodeScript(runScript, [
    "--base-url",
    options.baseUrl,
    "--label",
    options.label,
    "--output",
    remoteOutputPath,
    ...options.forwardedArgs,
  ])

  for (const backend of localBackends) {
    const baselinePath = resultPaths.get(backend.name)!
    const textSlug = `${backend.name}-vs-${options.label}`
    const compareText = runNodeScript(
      compareScript,
      [baselinePath, remoteOutputPath],
      { captureStdout: true },
    )
    process.stdout.write(`\n# ${textSlug}\n`)
    process.stdout.write(compareText)

    writeFileSync(path.join(outputDir, `compare-${textSlug}.txt`), compareText)

    const compareJson = runNodeScript(
      compareScript,
      ["--format", "json", baselinePath, remoteOutputPath],
      { captureStdout: true },
    )
    writeFileSync(path.join(outputDir, `compare-${textSlug}.json`), compareJson)
  }

  console.error(`Saved remote benchmark outputs to ${outputDir}`)
}

main()
