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

  test('returns 400 for unknown SearchPropertyKey', async () => {
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      p: ['unihan.kNoSuchProperty'],
      q: ['x'],
      limit: 5,
    })

    assert.equal(response.status, 400)
    assert.ok(json?.error?.message?.includes('Unknown query key'))
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

  test('kStrange glob matches null values as empty string', async () => {
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      p: ['unihan.kStrange.U.glob'],
      q: ['*'],
      limit: 50,
    })

    assertBasicSuccess(response, json, 50, ['unihan.kStrange.U.glob'], ['*'])
    assert.ok(json.results.length > 0)
  })

  test('supports .ne and .notGlob operators', async () => {
    const { json: eqJson } = await fetchJson('/api/v1/idsfind', {
      p: ['unihan.kTraditionalVariant'],
      q: ['線'],
      limit: 200,
      all_results: 1,
    })
    const eqSet = new Set<string>(eqJson.results)

    const { response: neResponse, json: neJson } = await fetchJson('/api/v1/idsfind', {
      p: ['unihan.kTraditionalVariant.ne'],
      q: ['線'],
      limit: 200,
      all_results: 1,
    })
    assertBasicSuccess(
      neResponse,
      neJson,
      200,
      ['unihan.kTraditionalVariant.ne'],
      ['線'],
    )
    assert.ok(neJson.results.length > 0)
    assert.ok(eqJson.results.length > 0)
    assert.ok(!new Set(neJson.results as string[]).has(eqJson.results[0]))
    for (const ch of neJson.results as string[]) {
      assert.ok(!eqSet.has(ch))
    }

    const { json: globJson } = await fetchJson('/api/v1/idsfind', {
      p: ['mji.読み.glob'],
      q: ['か*'],
      limit: 200,
      all_results: 1,
    })
    const globSet = new Set<string>(globJson.results)

    const { response: notGlobResponse, json: notGlobJson } = await fetchJson('/api/v1/idsfind', {
      p: ['mji.読み.notGlob'],
      q: ['か*'],
      limit: 200,
      all_results: 1,
    })
    assertBasicSuccess(
      notGlobResponse,
      notGlobJson,
      200,
      ['mji.読み.notGlob'],
      ['か*'],
    )
    assert.ok(notGlobJson.results.length > 0)
    assert.ok(globJson.results.length > 0)
    assert.ok(!new Set(notGlobJson.results as string[]).has(globJson.results[0]))
    for (const ch of notGlobJson.results as string[]) {
      assert.ok(!globSet.has(ch))
    }

    const { response: combinedResponse, json: combinedJson } = await fetchJson('/api/v1/idsfind', {
      p: ['unihan.kStrange.K.glob', 'unihan.kStrange.K.notGlob'],
      q: ['*', 'カ'],
      limit: 50,
    })
    assertBasicSuccess(
      combinedResponse,
      combinedJson,
      50,
      ['unihan.kStrange.K.glob', 'unihan.kStrange.K.notGlob'],
      ['*', 'カ'],
    )
  })

  test('supports .has and .notHas existence operators', async () => {
    {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['UCS', 'unihan.kMorohashi.has'],
        q: ['U+9A6B', ''],
        limit: 5,
      })
      assertBasicSuccess(
        response,
        json,
        5,
        ['UCS', 'unihan.kMorohashi.has'],
        ['U+9A6B', ''],
      )
      assert.ok(json.results.includes('驫'))
    }

    {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['UCS', 'unihan.kMorohashi.notHas'],
        q: ['U+3403', ''],
        limit: 5,
      })
      assertBasicSuccess(
        response,
        json,
        5,
        ['UCS', 'unihan.kMorohashi.notHas'],
        ['U+3403', ''],
      )
      assert.ok(json.results.includes('㐃'))
    }

    {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: ['UCS', 'totalStrokes.has'],
        q: ['U+9A6B', ''],
        limit: 5,
      })
      assertBasicSuccess(
        response,
        json,
        5,
        ['UCS', 'totalStrokes.has'],
        ['U+9A6B', ''],
      )
      assert.ok(json.results.includes('驫'))
    }
  })

  test('composes existence filters with IDS and stroke filters', async () => {
    const { response, json } = await fetchJson('/api/v1/idsfind', {
      ids: ['馬'],
      p: ['totalStrokes.ge', 'unihan.kMorohashi.has'],
      q: ['25', ''],
      limit: 200,
    })

    assertBasicSuccess(
      response,
      json,
      200,
      ['totalStrokes.ge', 'unihan.kMorohashi.has'],
      ['25', ''],
    )
    assert.ok(json.results.includes('驫'))
  })

  test('supports multiple mixed condition combinations without server errors', async () => {
    const cases: Array<{
      p: string[]
      q: string[]
      expectNonEmpty?: boolean
    }> = [
      {
        p: ['totalStrokes.ge', 'totalStrokes.le'],
        q: ['5', '12'],
        expectNonEmpty: true,
      },
      {
        p: ['mji.読み.glob', 'totalStrokes.le'],
        q: ['か*', '30'],
        expectNonEmpty: true,
      },
      {
        p: ['unihan.kStrange.K.glob', 'unihan.kStrange.K.notGlob'],
        q: ['*', 'カ'],
        expectNonEmpty: true,
      },
      {
        p: ['unihan.kTraditionalVariant', 'unihan.kTraditionalVariant.ne'],
        q: ['線', '線'],
      },
      {
        p: ['unihan.kTraditionalVariant.ne', 'totalStrokes.ge'],
        q: ['線', '1'],
        expectNonEmpty: true,
      },
      {
        p: ['unihan.kMorohashi.has', 'totalStrokes.ge'],
        q: ['', '25'],
        expectNonEmpty: true,
      },
    ]

    for (const { p, q, expectNonEmpty } of cases) {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p,
        q,
        limit: 200,
      })
      assertBasicSuccess(response, json, 200, p, q)
      if (expectNonEmpty) {
        assert.ok(json.results.length > 0)
      }
    }
  })

  test('supports selected newly added Unihan property keys', async () => {
    const cases: Array<{ p: string; q: string }> = [
      { p: 'unihan.kIRG_JSource', q: 'J0-3441' },
      { p: 'unihan.kIRG_GSource', q: 'G1-3A3A' },
      { p: 'unihan.kDefinition', q: 'Chinese' },
      { p: 'unihan.kJapaneseOn', q: 'KAN' },
      { p: 'unihan.kAccountingNumeric.ge', q: '2' },
      { p: 'unihan.kSimplifiedVariant', q: 'U+6C49' },
    ]

    for (const { p, q } of cases) {
      const { response, json } = await fetchJson('/api/v1/idsfind', {
        p: [p],
        q: [q],
        limit: 50,
      })
      assertBasicSuccess(response, json, 50, [p], [q])
      assert.ok(json.results.length > 0)
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
