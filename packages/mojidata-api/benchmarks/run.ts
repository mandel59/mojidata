import { performance } from 'node:perf_hooks'

import { createNodeApp } from '../node'

type Scenario = {
  name: string
  description: string
  pathname: string
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>
}

type Options = {
  baseUrl?: string
  iterations: number
  warmupIterations: number
  coldIterations: number
  format: 'table' | 'json'
  scenarioNames: string[]
}

type ScenarioResult = {
  name: string
  description: string
  samplesMs: number[]
  coldStartMs?: number[]
}

const defaultOrigin = 'http://benchmark.local'

const scenarios: Scenario[] = [
  {
    name: 'mojidata-basic',
    description: 'Single-character mojidata lookup',
    pathname: '/api/v1/mojidata',
    query: { char: '漢' },
  },
  {
    name: 'mojidata-select',
    description: 'mojidata lookup with select filter',
    pathname: '/api/v1/mojidata',
    query: { char: '漢', select: ['char', 'UCS', 'mji'] },
  },
  {
    name: 'ivs-list',
    description: 'IVS list lookup',
    pathname: '/api/v1/ivs-list',
    query: { char: '漢' },
  },
  {
    name: 'mojidata-variants',
    description: 'Variant relation lookup for multiple chars',
    pathname: '/api/v1/mojidata-variants',
    query: { char: ['漢', '漢'] },
  },
  {
    name: 'idsfind-ids',
    description: 'IDS fragment search',
    pathname: '/api/v1/idsfind',
    query: { ids: ['⿰亻言'], limit: 20 },
  },
  {
    name: 'idsfind-property',
    description: 'Property search by total strokes',
    pathname: '/api/v1/idsfind',
    query: { p: ['totalStrokes'], q: ['13'], limit: 20 },
  },
]

function parseIntegerOption(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${value}`)
  }
  return parsed
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    baseUrl: process.env.MOJIDATA_API_BASE_URL,
    iterations: parseIntegerOption(process.env.MOJIDATA_BENCH_ITERATIONS, 30, 'iterations'),
    warmupIterations: parseIntegerOption(process.env.MOJIDATA_BENCH_WARMUP, 5, 'warmup'),
    coldIterations: parseIntegerOption(process.env.MOJIDATA_BENCH_COLD, 3, 'cold'),
    format: process.env.MOJIDATA_BENCH_FORMAT === 'json' ? 'json' : 'table',
    scenarioNames: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--base-url':
        options.baseUrl = argv[++index]
        break
      case '--iterations':
        options.iterations = parseIntegerOption(argv[++index], options.iterations, 'iterations')
        break
      case '--warmup':
        options.warmupIterations = parseIntegerOption(argv[++index], options.warmupIterations, 'warmup')
        break
      case '--cold':
        options.coldIterations = parseIntegerOption(argv[++index], options.coldIterations, 'cold')
        break
      case '--format': {
        const format = argv[++index]
        if (format !== 'table' && format !== 'json') {
          throw new Error(`format must be "table" or "json", got: ${format}`)
        }
        options.format = format
        break
      }
      case '--scenario': {
        const name = argv[++index]
        if (!name) throw new Error('--scenario requires a value')
        options.scenarioNames.push(name)
        break
      }
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (options.iterations === 0) {
    throw new Error('iterations must be greater than 0')
  }

  return options
}

function printHelp() {
  console.log(`Usage: yarn bench [options]

Options:
  --base-url <url>      Benchmark an already-running HTTP server
  --iterations <n>      Measured iterations per scenario (default: 30)
  --warmup <n>          Warmup iterations per scenario (default: 5)
  --cold <n>            Cold-start iterations per scenario (default: 3, in-process only)
  --format <table|json> Output format (default: table)
  --scenario <name>     Run only the named scenario (repeatable)
  --help                Show this help

Scenarios:
${scenarios.map((scenario) => `  - ${scenario.name}: ${scenario.description}`).join('\n')}`)
}

function getSelectedScenarios(names: string[]): Scenario[] {
  if (names.length === 0) return scenarios
  const selected = names.map((name) => {
    const scenario = scenarios.find((entry) => entry.name === name)
    if (!scenario) {
      throw new Error(
        `Unknown scenario: ${name}\nAvailable scenarios: ${scenarios.map((entry) => entry.name).join(', ')}`,
      )
    }
    return scenario
  })
  return selected
}

function createUrl(
  pathname: string,
  query: Scenario['query'],
  baseUrl: string,
): string {
  const url = new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  if (!query) return url.toString()

  for (const [key, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    for (const value of values) {
      url.searchParams.append(key, String(value))
    }
  }

  return url.toString()
}

async function timedRequest(
  execute: (url: string) => Response | Promise<Response>,
  scenario: Scenario,
  baseUrl: string,
): Promise<number> {
  const url = createUrl(scenario.pathname, scenario.query, baseUrl)
  const startedAt = performance.now()
  const response = await Promise.resolve(execute(url))
  const finishedAt = performance.now()
  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `Scenario ${scenario.name} failed with ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
    )
  }

  try {
    JSON.parse(text)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown parse error: ${String(error)}`
    throw new Error(`Scenario ${scenario.name} returned invalid JSON: ${message}`)
  }

  return finishedAt - startedAt
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return Number.NaN
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * ratio) - 1),
  )
  return sortedValues[index]
}

function summarize(samplesMs: number[]) {
  const sortedValues = [...samplesMs].sort((left, right) => left - right)
  const total = sortedValues.reduce((sum, value) => sum + value, 0)
  return {
    minMs: sortedValues[0],
    avgMs: total / sortedValues.length,
    p50Ms: percentile(sortedValues, 0.5),
    p95Ms: percentile(sortedValues, 0.95),
    maxMs: sortedValues[sortedValues.length - 1],
  }
}

function formatMs(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '-'
  return `${value.toFixed(2)} ms`
}

function printTable(results: ScenarioResult[], options: Options) {
  const mode = options.baseUrl ? `remote (${options.baseUrl})` : 'in-process'
  console.log(
    `mojidata-api benchmark: ${mode}\n` +
      `iterations=${options.iterations}, warmup=${options.warmupIterations}, cold=${options.baseUrl ? 0 : options.coldIterations}`,
  )
  console.log('')

  const headers = ['scenario', 'cold avg', 'avg', 'p50', 'p95', 'max']
  const rows = results.map((result) => {
    const summary = summarize(result.samplesMs)
    const coldSummary =
      result.coldStartMs && result.coldStartMs.length > 0
        ? summarize(result.coldStartMs)
        : undefined
    return [
      result.name,
      formatMs(coldSummary?.avgMs),
      formatMs(summary.avgMs),
      formatMs(summary.p50Ms),
      formatMs(summary.p95Ms),
      formatMs(summary.maxMs),
    ]
  })

  const widths = headers.map((header, columnIndex) =>
    Math.max(
      header.length,
      ...rows.map((row) => row[columnIndex]?.length ?? 0),
    ),
  )

  const formatRow = (row: string[]) =>
    row.map((value, columnIndex) => value.padEnd(widths[columnIndex])).join('  ')

  console.log(formatRow(headers))
  console.log(formatRow(widths.map((width) => '-'.repeat(width))))
  for (const row of rows) {
    console.log(formatRow(row))
  }

  console.log('')
  for (const result of results) {
    console.log(`${result.name}: ${result.description}`)
  }
}

function printJson(results: ScenarioResult[], options: Options) {
  const payload = {
    mode: options.baseUrl ? 'remote' : 'in-process',
    baseUrl: options.baseUrl,
    iterations: options.iterations,
    warmupIterations: options.warmupIterations,
    coldIterations: options.baseUrl ? 0 : options.coldIterations,
    results: results.map((result) => ({
      name: result.name,
      description: result.description,
      samplesMs: result.samplesMs,
      coldStartMs: result.coldStartMs,
      summary: summarize(result.samplesMs),
      coldSummary:
        result.coldStartMs && result.coldStartMs.length > 0
          ? summarize(result.coldStartMs)
          : undefined,
    })),
  }
  console.log(JSON.stringify(payload, null, 2))
}

async function runScenario(
  scenario: Scenario,
  options: Options,
): Promise<ScenarioResult> {
  const baseUrl = options.baseUrl ?? defaultOrigin
  const result: ScenarioResult = {
    name: scenario.name,
    description: scenario.description,
    samplesMs: [],
  }

  if (options.baseUrl) {
    for (let index = 0; index < options.warmupIterations; index += 1) {
      await timedRequest((url) => fetch(url), scenario, baseUrl)
    }
    for (let index = 0; index < options.iterations; index += 1) {
      result.samplesMs.push(await timedRequest((url) => fetch(url), scenario, baseUrl))
    }
    return result
  }

  if (options.coldIterations > 0) {
    result.coldStartMs = []
    for (let index = 0; index < options.coldIterations; index += 1) {
      const app = createNodeApp()
      result.coldStartMs.push(
        await timedRequest(
          (url) => app.fetch(new Request(url)),
          scenario,
          baseUrl,
        ),
      )
    }
  }

  const app = createNodeApp()
  for (let index = 0; index < options.warmupIterations; index += 1) {
    await timedRequest((url) => app.fetch(new Request(url)), scenario, baseUrl)
  }
  for (let index = 0; index < options.iterations; index += 1) {
    result.samplesMs.push(
      await timedRequest((url) => app.fetch(new Request(url)), scenario, baseUrl),
    )
  }

  return result
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const selectedScenarios = getSelectedScenarios(options.scenarioNames)
  const results: ScenarioResult[] = []

  for (const scenario of selectedScenarios) {
    results.push(await runScenario(scenario, options))
  }

  if (options.format === 'json') {
    printJson(results, options)
    return
  }

  printTable(results, options)
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exit(1)
})
