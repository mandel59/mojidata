import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
const comparisonFormatVersion = 1

const compareCases = [
  {
    name: "whole-wildcard-fish",
    description: "Whole-pattern search with placeholder token",
    ids: ["§⿰？魚§"],
    includePrefilter: true,
  },
  {
    name: "whole-wildcard-fish-plus-fire",
    description: "Whole-pattern placeholder search with an extra fragment constraint",
    ids: ["§⿰？魚§", "火"],
    includePrefilter: false,
  },
  {
    name: "whole-variable-triplicate",
    description: "Variable-constrained whole-pattern search such as 品字様",
    ids: ["§⿱x⿰xx§"],
    includePrefilter: true,
  },
  {
    name: "whole-variable-triplicate-plus-mouth",
    description: "Variable-constrained whole-pattern search plus a selective fragment",
    ids: ["§⿱x⿰xx§", "口"],
    includePrefilter: true,
  },
  {
    name: "whole-variable-triplicate-plus-tree",
    description: "Variable-constrained whole-pattern search plus a second selective fragment",
    ids: ["§⿱x⿰xx§", "木"],
    includePrefilter: false,
  },
  {
    name: "multiplicity-ear3",
    description: "Multiplicity query with three 耳 components",
    ids: ["耳*3"],
    includePrefilter: false,
  },
  {
    name: "tree-and-ear3",
    description: "Combined fragment and multiplicity query",
    ids: ["木", "耳*3"],
    includePrefilter: false,
  },
  {
    name: "exact-moe-with-components",
    description: "Exact whole-pattern query with extra component constraints",
    ids: ["§⿱艹⿰日月§", "日", "月"],
    includePrefilter: true,
  },
]

function readGitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim()
  } catch {
    return undefined
  }
}

function readGitDirty() {
  try {
    const result = spawnSync("git", ["diff", "--quiet", "--ignore-submodules", "HEAD", "--"], {
      cwd: process.cwd(),
      stdio: "ignore",
    })
    if (result.status === 0) return false
    if (result.status === 1) return true
    return undefined
  } catch {
    return undefined
  }
}

function collectBenchmarkEnvironment() {
  return {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    gitRevision: readGitRevision(),
    gitDirty: readGitDirty(),
  }
}

function formatMs(value) {
  if (value === undefined || Number.isNaN(value)) return "-"
  return `${value.toFixed(2)} ms`
}

function formatDeltaPct(value) {
  if (value === undefined || Number.isNaN(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function parseIntegerOption(value, fallback, name) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${value}`)
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    iterations: parseIntegerOption(process.env.MOJIDATA_BENCH_ITERATIONS, 30, "iterations"),
    warmupIterations: parseIntegerOption(process.env.MOJIDATA_BENCH_WARMUP, 5, "warmup"),
    format: process.env.MOJIDATA_BENCH_FORMAT === "json" ? "json" : "table",
    outputPath: process.env.MOJIDATA_API_BENCH_OUTPUT,
    caseNames: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--iterations":
        options.iterations = parseIntegerOption(argv[++index], options.iterations, "iterations")
        break
      case "--warmup":
        options.warmupIterations = parseIntegerOption(argv[++index], options.warmupIterations, "warmup")
        break
      case "--format": {
        const format = argv[++index]
        if (format !== "table" && format !== "json") {
          throw new Error(`format must be "table" or "json", got: ${format}`)
        }
        options.format = format
        break
      }
      case "--output":
        options.outputPath = argv[++index]
        break
      case "--case": {
        const caseName = argv[++index]
        if (!caseName) throw new Error("--case requires a value")
        options.caseNames.push(caseName)
        break
      }
      case "--help":
      case "-h":
        printHelp()
        process.exit(0)
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (options.iterations === 0) {
    throw new Error("iterations must be greater than 0")
  }

  return options
}

function printHelp() {
  console.log(`Usage: yarn bench:idsfind-fts [options]

Options:
  --iterations <n>      Measured iterations per case (default: 30)
  --warmup <n>          Warmup iterations per case (default: 5)
  --format <table|json> Console output format (default: table)
  --output <path>       Write machine-readable JSON results to a file
  --case <name>         Run only the named comparison case (repeatable)
  --help                Show this help

Cases:
${compareCases.map((entry) => `  - ${entry.name}: ${entry.description}`).join("\n")}`)
}

function getSelectedCases(names) {
  if (names.length === 0) return compareCases
  return names.map((name) => {
    const found = compareCases.find((entry) => entry.name === name)
    if (!found) {
      throw new Error(
        `Unknown case: ${name}\nAvailable cases: ${compareCases.map((entry) => entry.name).join(", ")}`,
      )
    }
    return found
  })
}

function printTable(result) {
  const lines = [
    `idsfind FTS4 vs FTS5 comparison`,
    `Decision: keep dual support (${result.rationale})`,
    `Runtime: ${result.environment.nodeVersion} ${result.environment.platform}-${result.environment.arch}`,
    `Git revision: ${result.environment.gitRevision ?? "unknown"}`,
    "",
    `| Case | Hits | Candidates | Same order | FTS4 avg | FTS5 avg | Delta |`,
    `| --- | ---: | ---: | :---: | ---: | ---: | ---: |`,
  ]

  for (const entry of result.results) {
    lines.push(
      `| ${entry.name} | ${entry.resultCount} | ${entry.candidateCountFts4} | ${entry.sameOrder ? "yes" : "no"} | ${formatMs(entry.full.fts4.summary.avgMs)} | ${formatMs(entry.full.fts5.summary.avgMs)} | ${formatDeltaPct(entry.full.deltaPct)} |`,
    )
    if (entry.prefilter) {
      lines.push(
        `| ${entry.name} (prefilter) | - | - | - | ${formatMs(entry.prefilter.fts4.summary.avgMs)} | ${formatMs(entry.prefilter.fts5.summary.avgMs)} | ${formatDeltaPct(entry.prefilter.deltaPct)} |`,
      )
    }
  }

  const mismatches = result.results.filter((entry) => !entry.sameResults || !entry.sameOrder)
  lines.push("")
  if (mismatches.length === 0) {
    lines.push("All selected cases produced identical result sets and ordering.")
  } else {
    lines.push("Result mismatches were detected:")
    for (const mismatch of mismatches) {
      lines.push(`- ${mismatch.name}`)
    }
  }

  process.stdout.write(`${lines.join("\n")}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const selectedCases = getSelectedCases(options.caseNames)

  const innerScript = `
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const config = JSON.parse(process.env.MOJIDATA_IDS_FIND_FTS_COMPARE_CONFIG ?? "{}");
const core = await import("../mojidata-api-core/index.ts");
const better = await import("../mojidata-api-better-sqlite3/lib/better-sqlite3-node.ts");
const { createSqlApiDb } = core.default;
const { createBetterSqlite3ExecutorProvider, createBetterSqlite3MojidataDbProvider } = better.default;
function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return Number.NaN;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}
function summarize(samplesMs) {
  const sortedValues = [...samplesMs].sort((left, right) => left - right);
  const total = sortedValues.reduce((sum, value) => sum + value, 0);
  return {
    minMs: sortedValues[0],
    avgMs: total / sortedValues.length,
    p50Ms: percentile(sortedValues, 0.5),
    p95Ms: percentile(sortedValues, 0.95),
    maxMs: sortedValues[sortedValues.length - 1],
  };
}
async function timeOperation(run, iterations, warmupIterations) {
  for (let index = 0; index < warmupIterations; index += 1) {
    await run();
  }
  const samplesMs = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await run();
    samplesMs.push(performance.now() - startedAt);
  }
  return { samplesMs, summary: summarize(samplesMs) };
}
function summarizeComparison(fts4, fts5) {
  return {
    fts4,
    fts5,
    deltaPct: fts4.summary.avgMs === 0 ? undefined : ((fts5.summary.avgMs - fts4.summary.avgMs) / fts4.summary.avgMs) * 100,
  };
}
function diffResults(fts4, fts5) {
  const fts4Set = new Set(fts4);
  const fts5Set = new Set(fts5);
  const onlyInFts4 = fts4.filter((value) => !fts5Set.has(value));
  const onlyInFts5 = fts5.filter((value) => !fts4Set.has(value));
  if (onlyInFts4.length === 0 && onlyInFts5.length === 0) return undefined;
  return { onlyInFts4, onlyInFts5 };
}
const mojiDbPath = require.resolve("@mandel59/mojidata/dist/moji.db");
const idsfindFts4Path = require.resolve("@mandel59/idsdb/idsfind.db");
const idsfindFts5Path = require.resolve("../idsdb-fts5/idsfind.db");
const getMojidataDb = createBetterSqlite3MojidataDbProvider(mojiDbPath);
const fts4 = createSqlApiDb({
  getMojidataDb,
  getIdsfindDb: createBetterSqlite3ExecutorProvider(idsfindFts4Path),
});
const fts5 = createSqlApiDb({
  getMojidataDb,
  getIdsfindDb: createBetterSqlite3ExecutorProvider(idsfindFts5Path),
});
const results = [];
for (const compareCase of config.cases) {
  const [fts4Results, fts5Results, fts4Candidates, fts5Candidates] = await Promise.all([
    fts4.idsfind(compareCase.ids),
    fts5.idsfind(compareCase.ids),
    fts4.idsfindDebugQuery("select count(*) as c from results", compareCase.ids),
    fts5.idsfindDebugQuery("select count(*) as c from results", compareCase.ids),
  ]);
  const fullFts4 = await timeOperation(() => fts4.idsfind(compareCase.ids), config.iterations, config.warmupIterations);
  const fullFts5 = await timeOperation(() => fts5.idsfind(compareCase.ids), config.iterations, config.warmupIterations);
  let prefilter;
  if (compareCase.includePrefilter) {
    const prefilterFts4 = await timeOperation(() => fts4.idsfindDebugQuery("select count(*) as c from results", compareCase.ids), config.iterations, config.warmupIterations);
    const prefilterFts5 = await timeOperation(() => fts5.idsfindDebugQuery("select count(*) as c from results", compareCase.ids), config.iterations, config.warmupIterations);
    prefilter = summarizeComparison(prefilterFts4, prefilterFts5);
  }
  const mismatch = diffResults(fts4Results, fts5Results);
  results.push({
    name: compareCase.name,
    description: compareCase.description,
    ids: compareCase.ids,
    resultCount: fts4Results.length,
    candidateCountFts4: Number(fts4Candidates[0]?.c ?? 0),
    candidateCountFts5: Number(fts5Candidates[0]?.c ?? 0),
    sameResults: mismatch === undefined,
    sameOrder: JSON.stringify(fts4Results) === JSON.stringify(fts5Results),
    mismatch,
    sample: fts4Results.slice(0, 8),
    full: summarizeComparison(fullFts4, fullFts5),
    prefilter,
  });
}
process.stdout.write(JSON.stringify(results));
`

  const child = spawnSync(
    "corepack",
    ["yarn", "workspace", "@mandel59/idsdb", "exec", "node", "--import", "tsx", "-e", innerScript],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        MOJIDATA_IDS_FIND_FTS_COMPARE_CONFIG: JSON.stringify({
          iterations: options.iterations,
          warmupIterations: options.warmupIterations,
          cases: selectedCases,
        }),
      },
    },
  )

  if ((child.status ?? 1) !== 0) {
    if (child.stdout) process.stdout.write(child.stdout)
    if (child.stderr) process.stderr.write(child.stderr)
    process.exit(child.status ?? 1)
  }

  const results = JSON.parse(child.stdout)

  const comparisonRun = {
    formatVersion: comparisonFormatVersion,
    iterations: options.iterations,
    warmupIterations: options.warmupIterations,
    environment: collectBenchmarkEnvironment(),
    decision: "keep-dual-support",
    rationale: "sql.js still requires the FTS4 package because the official sql.js build does not provide FTS5.",
    results,
  }

  if (options.outputPath) {
    const outputPath = resolve(process.cwd(), options.outputPath)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, JSON.stringify(comparisonRun, null, 2))
  }

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(comparisonRun, null, 2)}\n`)
    return
  }

  printTable(comparisonRun)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
