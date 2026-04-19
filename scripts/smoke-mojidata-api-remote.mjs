import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"

function parseArgs(argv) {
  let baseUrl
  let timeoutMs = 10_000

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") {
      continue
    }
    if (arg === "--base-url") {
      baseUrl = argv[++i]
      continue
    }
    if (arg === "--timeout-ms") {
      timeoutMs = Number(argv[++i])
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!baseUrl) {
    throw new Error("--base-url is required")
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number")
  }

  return { baseUrl, timeoutMs }
}

function printUsage() {
  console.log(`Usage: node ./scripts/smoke-mojidata-api-remote.mjs --base-url https://example.workers.dev [--timeout-ms 10000]

Runs a small smoke test suite against a deployed mojidata-api endpoint.`)
}

function buildUrl(baseUrl, pathname, query) {
  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      url.searchParams.append(key, String(item))
    }
  }
  return url
}

async function fetchJson({ baseUrl, pathname, query, timeoutMs }) {
  const url = buildUrl(baseUrl, pathname, query)
  const startedAt = performance.now()
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const durationMs = performance.now() - startedAt
  const bodyText = await response.text()
  let json
  try {
    json = JSON.parse(bodyText)
  } catch (error) {
    throw new Error(`Expected JSON from ${url.href}, got: ${bodyText.slice(0, 200)}`, {
      cause: error,
    })
  }
  return { url, response, json, durationMs }
}

const cases = [
  {
    name: "mojidata",
    pathname: "/api/v1/mojidata",
    query: { char: "漢", select: ["char", "UCS"] },
    assert(json) {
      assert.deepEqual(json.query, { char: "漢", select: ["char", "UCS"] })
      assert.deepEqual(json.results, { char: "漢", UCS: "U+6F22" })
    },
  },
  {
    name: "ivs-list",
    pathname: "/api/v1/ivs-list",
    query: { char: "一" },
    assert(json) {
      assert.deepEqual(json.query, { char: "一" })
      assert.ok(Array.isArray(json.results))
      assert.ok(json.results.length > 0)
      assert.equal(json.results[0].IVS, "一󠄀")
      assert.equal(json.results[0].unicode, "4E00 E0100")
    },
  },
  {
    name: "idsfind",
    pathname: "/api/v1/idsfind",
    query: { ids: "⿰亻言", limit: 20 },
    assert(json) {
      assert.deepEqual(json.query.ids, ["⿰亻言"])
      assert.equal(json.query.limit, 20)
      assert.ok(Array.isArray(json.query.whole))
      assert.ok(Array.isArray(json.results))
      assert.ok(json.results.includes("信"))
    },
  },
]

async function main() {
  const { baseUrl, timeoutMs } = parseArgs(process.argv.slice(2))

  console.log(`Smoke-testing ${baseUrl}`)
  const results = []
  for (const testCase of cases) {
    const { url, response, json, durationMs } = await fetchJson({
      baseUrl,
      pathname: testCase.pathname,
      query: testCase.query,
      timeoutMs,
    })

    assert.equal(response.status, 200, `${testCase.name}: unexpected status from ${url.href}`)
    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/json/i,
      `${testCase.name}: content-type was not JSON`,
    )
    testCase.assert(json)
    results.push({ name: testCase.name, url: url.href, durationMs })
    console.log(`ok ${testCase.name} ${durationMs.toFixed(1)}ms ${url.pathname}${url.search}`)
  }

  console.log("")
  console.log("Smoke test summary:")
  for (const result of results) {
    console.log(`- ${result.name}: ${result.durationMs.toFixed(1)} ms`)
  }
}

await main()
