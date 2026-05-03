import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

type QueryValue = string | number | boolean | null | undefined
type Query = Record<string, QueryValue | QueryValue[]>

export type MojidataApiTestApp = {
  fetch(request: Request): Response | Promise<Response>
}

export type CreateMojidataApiTestApp = () =>
  | MojidataApiTestApp
  | Promise<MojidataApiTestApp>

function buildUrl(pathname: string, query: Query = {}) {
  const url = new URL(pathname, 'http://mojidata-api.test')
  for (const [key, rawValue] of Object.entries(query)) {
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value === undefined || value === null) continue
        url.searchParams.append(key, String(value))
      }
      continue
    }
    if (rawValue === undefined || rawValue === null) continue
    url.searchParams.set(key, String(rawValue))
  }
  return url
}

async function fetchJson(
  app: MojidataApiTestApp,
  pathname: string,
  query?: Query,
): Promise<{ response: Response; json: any }> {
  const response = await app.fetch(new Request(buildUrl(pathname, query)))
  const text = await response.text()
  return {
    response,
    json: text.length > 0 ? JSON.parse(text) : null,
  }
}

function assertJsonResponse(response: Response) {
  assert.equal(response.status, 200)
  assert.ok(
    (response.headers.get('content-type') ?? '').includes('application/json'),
  )
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
}

function assertIncludesRecord<T extends Record<string, unknown>>(
  rows: unknown,
  expected: T,
) {
  assert.ok(Array.isArray(rows))
  assert.ok(
    rows.some((row) =>
      row &&
      typeof row === 'object' &&
      Object.entries(expected).every(
        ([key, value]) => (row as Record<string, unknown>)[key] === value,
      ),
    ),
    `expected rows to include ${JSON.stringify(expected)}, got ${JSON.stringify(rows)}`,
  )
}

export function runMojidataApiConformanceTests(
  name: string,
  createApp: CreateMojidataApiTestApp,
) {
  describe(name, () => {
    let appPromise: Promise<MojidataApiTestApp> | undefined
    const getApp = () => {
      appPromise ??= Promise.resolve(createApp())
      return appPromise
    }

    test('serves selected mojidata fields', async () => {
      const { response, json } = await fetchJson(await getApp(), '/api/v1/mojidata', {
        char: '漢',
        select: ['char', 'UCS'],
      })

      assertJsonResponse(response)
      assert.deepEqual(json.query, { char: '漢', select: ['char', 'UCS'] })
      assert.deepEqual(json.results, { char: '漢', UCS: 'U+6F22' })
    })

    test('serves ids_similar entries for current IDS mirror and rotation operators', async () => {
      const mirror = await fetchJson(await getApp(), '/api/v1/mojidata', {
        char: '卍',
        select: 'ids_similar',
      })
      const rotation = await fetchJson(await getApp(), '/api/v1/mojidata', {
        char: '了',
        select: 'ids_similar',
      })

      assertJsonResponse(mirror.response)
      assert.deepEqual(mirror.json.query, { char: '卍', select: ['ids_similar'] })
      assertIncludesRecord(mirror.json.results.ids_similar, {
        UCS: '卐',
        IDS: '⿾卍',
        source: 'GT',
      })

      assertJsonResponse(rotation.response)
      assert.deepEqual(rotation.json.query, { char: '了', select: ['ids_similar'] })
      assertIncludesRecord(rotation.json.results.ids_similar, {
        UCS: '𠄏',
        IDS: '⿿了',
        source: 'GTP',
      })
    })

    test('serves IVS list results', async () => {
      const { response, json } = await fetchJson(await getApp(), '/api/v1/ivs-list', {
        char: '一',
      })

      assertJsonResponse(response)
      assert.deepEqual(json.query, { char: '一' })
      assert.ok(Array.isArray(json.results))
      assert.ok(json.results.length > 0)
      assert.equal(typeof json.results[0].IVS, 'string')
      assert.equal(typeof json.results[0].unicode, 'string')
      assert.equal(typeof json.results[0].collection, 'string')
      assert.equal(typeof json.results[0].code, 'string')
      assert.ok(json.results[0].IVS.startsWith('一'))
      assert.match(json.results[0].unicode, /^4E00 /u)
    })

    test('serves idsfind results', async () => {
      const { response, json } = await fetchJson(await getApp(), '/api/v1/idsfind', {
        ids: '⿰亻言',
        limit: 20,
      })

      assertJsonResponse(response)
      assert.deepEqual(json.query, { ids: ['⿰亻言'], whole: [], limit: 20 })
      assert.ok(Array.isArray(json.results))
      assert.ok(json.results.includes('信'))
    })
  })
}
