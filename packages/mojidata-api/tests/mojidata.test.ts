import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { fetchJson } from './test-utils'

describe('GET /api/v1/mojidata', () => {
  test('returns mojidata for a character', async () => {
    const { response, json } = await fetchJson('/api/v1/mojidata', {
      char: '漢',
    })

    assert.equal(response.status, 200)
    assert.ok(
      (response.headers.get('content-type') ?? '').includes('application/json'),
    )
    assert.equal(response.headers.get('access-control-allow-origin'), '*')

    assert.ok(json && typeof json === 'object')
    assert.ok('query' in json)
    assert.ok('results' in json)
    assert.equal(json.query.char, '漢')
    assert.equal(json.results.char, '漢')
    assert.match(json.results.UCS, /^U\+[0-9A-F]{4,6}$/)
  })

  test('supports select to limit returned fields', async () => {
    const { response, json } = await fetchJson('/api/v1/mojidata', {
      char: '漢',
      select: ['char', 'UCS'],
    })

    assert.equal(response.status, 200)
    assert.deepEqual(json.query.select, ['char', 'UCS'])
    assert.equal(json.results.char, '漢')
    assert.match(json.results.UCS, /^U\+[0-9A-F]{4,6}$/)
    assert.deepEqual(Object.keys(json.results).sort(), ['UCS', 'char'])
  })

  test('supports computed unihan_rs field without SQL-only helpers', async () => {
    const { response, json } = await fetchJson('/api/v1/mojidata', {
      char: '漢',
      select: ['unihan_rs'],
    })

    assert.equal(response.status, 200)
    assert.deepEqual(json.query.select, ['unihan_rs'])
    assert.deepEqual(json.results, {
      unihan_rs: {
        kRSAdobe_Japan1_6: [[85, 10, '水', 3, 'CID+1533']],
        kRSUnicode: [[85, 11, '水', '85']],
      },
    })
  })
})
