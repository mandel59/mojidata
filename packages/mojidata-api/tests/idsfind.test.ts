import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { fetchJson } from './test-utils'

describe('GET /api/v1/idsfind', () => {
  const assertBasicSuccess = (
    response: Response,
    json: any,
    limit: number,
    p?: string[],
    q?: string[],
  ) => {
    assert.equal(response.status, 200)
    assert.ok(
      (response.headers.get('content-type') ?? '').includes('application/json'),
    )
    assert.equal(response.headers.get('access-control-allow-origin'), '*')

    if (p) assert.deepEqual(json.query.p, p)
    if (q) assert.deepEqual(json.query.q, q)

    assert.ok(Array.isArray(json.results))
    assert.ok(json.results.length <= limit)
    for (const value of json.results) {
      assert.equal(typeof value, 'string')
      assert.ok([...value].length >= 1)
    }
  }

  test('finds characters by IDS fragments', async () => {
    const limit = 5
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      ids: ['⿰亻言'],
      limit,
    })

    assertBasicSuccess(response, json, limit)

    assert.deepEqual(json.query.ids, ['⿰亻言'])
  })

  test('finds characters by whole-character patterns', async () => {
    const limit = 5
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      whole: ['⿰亻言'],
      limit,
    })

    assertBasicSuccess(response, json, limit)
    assert.deepEqual(json.query.whole, ['⿰亻言'])
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
    assert.ok(json.results.includes('一'))
  })

  for (const { p, q } of [
    { p: 'mji.読み', q: 'かん' },
    { p: 'mji.読み.prefix', q: 'か' },
    { p: 'mji.読み.glob', q: 'か*' },
    { p: 'mji.総画数.lt', q: '50' },
    { p: 'mji.総画数.le', q: '50' },
    { p: 'mji.総画数.gt', q: '1' },
    { p: 'mji.総画数.ge', q: '1' },
    { p: 'unihan.kTotalStrokes', q: '6' },
    { p: 'unihan.kTotalStrokes.eq', q: '6' },
    { p: 'unihan.kTotalStrokes.lt', q: '50' },
    { p: 'unihan.kTotalStrokes.le', q: '50' },
    { p: 'unihan.kTotalStrokes.gt', q: '1' },
    { p: 'unihan.kTotalStrokes.ge', q: '1' },
    { p: 'totalStrokes.eq', q: '13' },
    { p: 'totalStrokes.lt', q: '50' },
    { p: 'totalStrokes.le', q: '50' },
    { p: 'totalStrokes.gt', q: '1' },
    { p: 'totalStrokes.ge', q: '1' },
    { p: 'unihan.kTraditionalVariant', q: '銀' },
    { p: 'unihan.kTraditionalVariant', q: 'U+9280' },
    { p: 'unihan.kSemanticVariant', q: '炮' },
    { p: 'unihan.kStrange.I', q: '龍' },
    { p: 'unihan.kStrange.I', q: 'U+9F8D' },
    { p: 'unihan.kStrange.I.glob', q: '龍' },
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

  test('finds simplified character by unihan.kTraditionalVariant (char/U+ input)', async () => {
    {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['unihan.kTraditionalVariant'],
        q: ['銀'],
        limit: 20,
      })
      assertBasicSuccess(
        response,
        json,
        20,
        ['unihan.kTraditionalVariant'],
        ['銀'],
      )
      assert.ok(json.results.includes('银'))
    }

    {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['unihan.kTraditionalVariant'],
        q: ['U+9280'],
        limit: 20,
      })
      assertBasicSuccess(
        response,
        json,
        20,
        ['unihan.kTraditionalVariant'],
        ['U+9280'],
      )
      assert.ok(json.results.includes('银'))
    }
  })

  test('finds kStrange category matches by character/U+ input', async () => {
    const expected = String.fromCodePoint(0x33473)

    {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['unihan.kStrange.I'],
        q: ['龍'],
        limit: 50,
      })
      assertBasicSuccess(response, json, 50, ['unihan.kStrange.I'], ['龍'])
      assert.ok(json.results.includes(expected))
    }

    {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['unihan.kStrange.I'],
        q: ['U+9F8D'],
        limit: 50,
      })
      assertBasicSuccess(response, json, 50, ['unihan.kStrange.I'], ['U+9F8D'])
      assert.ok(json.results.includes(expected))
    }
  })

  test('supports SearchPropertyKey=mji.MJ文字図形名 and mji.総画数', async () => {
    const { json: mojidata } = await fetchJson('/api/v1/mojidata', {
      char: '漢',
      select: ['mji'],
    })

    const mjiEntries: any[] | undefined = mojidata?.results?.mji
    assert.ok(Array.isArray(mjiEntries))
    assert.ok((mjiEntries?.length ?? 0) > 0)

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
    assert.ok(sample)

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
      assert.ok(json.results.includes(expectedChar))
    }

    {
      const limit = 10
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['mji.総画数'],
        q: [strokes],
        limit,
      })
      assertBasicSuccess(response, json, limit, ['mji.総画数'], [strokes])
      assert.ok(json.results.length > 0)
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
      assert.ok(json.results.includes(expectedChar))
    }
  })
})
