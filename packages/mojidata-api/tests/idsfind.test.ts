import { describe, expect, test } from 'bun:test'
import { fetchJson } from './test-utils'

describe('GET /api/v1/idsfind', () => {
  const assertBasicSuccess = (
    response: Response,
    json: any,
    limit: number,
    p?: string[],
    q?: string[],
  ) => {
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type') ?? '').toContain(
      'application/json',
    )
    expect(response.headers.get('access-control-allow-origin')).toBe('*')

    if (p) expect(json.query.p).toEqual(p)
    if (q) expect(json.query.q).toEqual(q)

    expect(Array.isArray(json.results)).toBe(true)
    expect(json.results.length).toBeLessThanOrEqual(limit)
    for (const value of json.results) {
      expect(typeof value).toBe('string')
      expect([...value].length).toBeGreaterThanOrEqual(1)
    }
  }

  test('finds characters by IDS fragments', async () => {
    const limit = 5
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      ids: ['⿰亻言'],
      limit,
    })

    assertBasicSuccess(response, json, limit)

    expect(json.query.ids).toEqual(['⿰亻言'])
  })

  test('finds characters by whole-character patterns', async () => {
    const limit = 5
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      whole: ['⿰亻言'],
      limit,
    })

    assertBasicSuccess(response, json, limit)
    expect(json.query.whole).toEqual(['⿰亻言'])
  })

  test('supports property-search mode (p/q) without ids/whole', async () => {
    const limit = 5
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      p: ['totalStrokes'],
      q: ['13'],
      limit,
    })

    assertBasicSuccess(response, json, limit, ['totalStrokes'], ['13'])
  })

  test('supports SearchPropertyKey=UCS', async () => {
    const limit = 5
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      p: ['UCS'],
      q: ['4E00'],
      limit,
    })

    assertBasicSuccess(response, json, limit, ['UCS'], ['4E00'])
    expect(json.results).toContain('一')
  })

  for (const { p, q } of [
    { p: 'mji.読み', q: 'かん' },
    { p: 'mji.読み.prefix', q: 'か' },
    { p: 'mji.総画数.lt', q: '50' },
    { p: 'mji.総画数.le', q: '50' },
    { p: 'mji.総画数.gt', q: '1' },
    { p: 'mji.総画数.ge', q: '1' },
    { p: 'unihan.kTotalStrokes', q: '6' },
    { p: 'unihan.kTotalStrokes.lt', q: '50' },
    { p: 'unihan.kTotalStrokes.le', q: '50' },
    { p: 'unihan.kTotalStrokes.gt', q: '1' },
    { p: 'unihan.kTotalStrokes.ge', q: '1' },
    { p: 'totalStrokes.lt', q: '50' },
    { p: 'totalStrokes.le', q: '50' },
    { p: 'totalStrokes.gt', q: '1' },
    { p: 'totalStrokes.ge', q: '1' },
  ]) {
    test(`supports SearchPropertyKey=${p}`, async () => {
      const limit = 3
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: [p],
        q: [q],
        limit,
      })

      assertBasicSuccess(response, json, limit, [p], [q])
    })
  }

  test('supports SearchPropertyKey=mji.MJ文字図形名 and mji.総画数', async () => {
    const { json: mojidata } = await fetchJson('/api/v1/mojidata', {
      char: '漢',
      select: ['mji'],
    })

    const mjiEntries: any[] | undefined = mojidata?.results?.mji
    expect(Array.isArray(mjiEntries)).toBe(true)
    expect(mjiEntries?.length).toBeGreaterThan(0)

    const getFirst = (obj: any, keys: string[]) => {
      for (const key of keys) {
        const value = obj?.[key]
        if (typeof value === 'string' && value.length > 0) return value
        if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      }
      return undefined
    }

    const sample = mjiEntries?.find((x) => {
      const mj = getFirst(x, ['MJ文字図形名', 'mji.MJ文字図形名'])
      const s = getFirst(x, ['総画数', 'mji.総画数'])
      return typeof mj === 'string' && mj.startsWith('MJ') && typeof s === 'string' && /^[0-9]+$/.test(s)
    })
    expect(sample).toBeTruthy()

    const mjName = getFirst(sample, ['MJ文字図形名', 'mji.MJ文字図形名']) as string
    const strokes = getFirst(sample, ['総画数', 'mji.総画数']) as string
    const toChar = (value: string) => {
      const m = /^U\+?([0-9A-F]+)$/i.exec(value)
      if (!m) return value
      return String.fromCodePoint(parseInt(m[1], 16))
    }
    const expectedChar = toChar(
      ((getFirst(sample, ['対応するUCS', 'mji.対応するUCS']) as string | undefined) ??
        '漢') as string,
    )

    {
      const limit = 10
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['mji.MJ文字図形名'],
        q: [mjName as string],
        limit,
      })
      assertBasicSuccess(
        response,
        json,
        limit,
        ['mji.MJ文字図形名'],
        [mjName as string],
      )
      expect(json.results).toContain(expectedChar)
    }

    {
      const limit = 10
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['mji.総画数'],
        q: [strokes],
        limit,
      })
      assertBasicSuccess(response, json, limit, ['mji.総画数'], [strokes])
      expect(json.results.length).toBeGreaterThan(0)
    }

    {
      const limit = 10
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['mji.MJ文字図形名', 'mji.総画数'],
        q: [mjName, strokes],
        limit,
      })
      assertBasicSuccess(
        response,
        json,
        limit,
        ['mji.MJ文字図形名', 'mji.総画数'],
        [mjName, strokes],
      )
      expect(json.results).toContain(expectedChar)
    }
  })
})
