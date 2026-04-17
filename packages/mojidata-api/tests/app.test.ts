import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createApp } from '../app'
import type { MojidataApiDb } from '../api/v1/_lib/mojidata-api-db'

function createFakeDb(overrides: Partial<MojidataApiDb> = {}): MojidataApiDb {
  return {
    async getMojidataJson() {
      return '{"char":"漢","UCS":"U+6F22"}'
    },
    async getIvsList() {
      return [
        {
          IVS: '漢\udb40\udd00',
          unicode: '6F22 E0100',
          collection: 'Example',
          code: '001',
        },
      ]
    },
    async getMojidataVariantRels() {
      return [{ c1: '漢', c2: '漢', f: 1, r: 'kSemanticVariant' }]
    },
    async idsfind() {
      return ['信', '誠']
    },
    async idsfindDebugQuery() {
      return []
    },
    async search() {
      return ['一', '丁']
    },
    async filterChars(chars) {
      return chars
    },
    ...overrides,
  }
}

async function fetchJson(app: ReturnType<typeof createApp>, path: string) {
  const response = await app.fetch(new Request(`http://local${path}`))
  const json = await response.json()
  return { response, json }
}

describe('createApp', () => {
  test('returns mojidata JSON with CORS headers', async () => {
    const app = createApp(createFakeDb())

    const { response, json } = await fetchJson(
      app,
      '/api/v1/mojidata?char=%E6%BC%A2&select=char&select=UCS',
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.deepEqual(json.query, { char: '漢', select: ['char', 'UCS'] })
    assert.deepEqual(json.results, { char: '漢', UCS: 'U+6F22' })
  })

  test('validates mojidata input before touching the DB', async () => {
    let called = false
    const app = createApp(
      createFakeDb({
        async getMojidataJson() {
          called = true
          return null
        },
      }),
    )

    const { response, json } = await fetchJson(app, '/api/v1/mojidata?char=ab')

    assert.equal(response.status, 400)
    assert.equal(json.error.message, 'char must be a single character')
    assert.equal(called, false)
  })

  test('routes ivs-list and variants requests through the DB interface', async () => {
    const app = createApp(createFakeDb())

    const ivs = await fetchJson(app, '/api/v1/ivs-list?char=%E6%BC%A2')
    const variants = await fetchJson(
      app,
      '/api/v1/mojidata-variants?char=%E6%BC%A2&char=U%2BFA47',
    )

    assert.equal(ivs.response.status, 200)
    assert.deepEqual(ivs.json.query, { char: '漢' })
    assert.equal(ivs.json.results[0].IVS, '漢\udb40\udd00')

    assert.equal(variants.response.status, 200)
    assert.deepEqual(variants.json.query, { char: ['漢', '漢'] })
    assert.deepEqual(variants.json.results, [
      { c1: '漢', c2: '漢', f: 1, r: 'kSemanticVariant' },
    ])
  })

  test('supports idsfind property mode without ids/whole inputs', async () => {
    const app = createApp(createFakeDb())

    const { response, json } = await fetchJson(
      app,
      '/api/v1/idsfind?p=UCS&q=4E00&limit=1',
    )

    assert.equal(response.status, 200)
    assert.deepEqual(json.query, {
      p: ['UCS'],
      q: ['4E00'],
      limit: 1,
    })
    assert.deepEqual(json.results, ['一'])
    assert.equal(json.done, false)
  })

  test('returns 400 for unknown idsfind property keys', async () => {
    const app = createApp(
      createFakeDb({
        async search() {
          throw new Error('Unknown query key: nope')
        },
      }),
    )

    const { response, json } = await fetchJson(
      app,
      '/api/v1/idsfind?p=nope&q=x&limit=1',
    )

    assert.equal(response.status, 400)
    assert.equal(json.error.message, 'Unknown query key: nope')
  })
})
