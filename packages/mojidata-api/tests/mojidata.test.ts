import { describe, expect, test } from 'bun:test'
import { fetchJson } from './test-utils'

describe('GET /api/v1/mojidata', () => {
  test('returns mojidata for a character', async () => {
    const { response, json } = await fetchJson('/api/v1/mojidata', {
      char: '漢',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type') ?? '').toContain(
      'application/json',
    )
    expect(response.headers.get('access-control-allow-origin')).toBe('*')

    expect(json).toHaveProperty('query')
    expect(json).toHaveProperty('results')
    expect(json.query.char).toBe('漢')
    expect(json.results.char).toBe('漢')
    expect(json.results.UCS).toMatch(/^U\+[0-9A-F]{4,6}$/)
  })

  test('supports select to limit returned fields', async () => {
    const { response, json } = await fetchJson('/api/v1/mojidata', {
      char: '漢',
      select: ['char', 'UCS'],
    })

    expect(response.status).toBe(200)
    expect(json.query.select).toEqual(['char', 'UCS'])
    expect(json.results.char).toBe('漢')
    expect(json.results.UCS).toMatch(/^U\+[0-9A-F]{4,6}$/)
    expect(Object.keys(json.results).sort()).toEqual(['UCS', 'char'])
  })
})
