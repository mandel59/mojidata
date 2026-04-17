import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const { getQueryAndArgs } = require('../api/v1/_lib/libsearch.ts') as {
  getQueryAndArgs: (p: string, q: string) => [string, string[]]
}

describe('libsearch query key resolution', () => {
  test('supports .eq alias for numeric keys', () => {
    const [q1, a1] = getQueryAndArgs('unihan.kTotalStrokes.eq', '6')
    assert.ok(q1.includes('unihan_kTotalStrokes'))
    assert.equal(a1.length, 1)
    assert.equal(a1[0], '6')

    const [q2, a2] = getQueryAndArgs('totalStrokes.eq', '13')
    assert.ok(q2.includes('unihan_kTotalStrokes'))
    assert.ok(q2.includes('mji.総画数'))
    assert.equal(a2.length, 2)
    assert.deepEqual(a2, ['13', '13'])
  })

  test('supports mji.読み.glob', () => {
    const [query, args] = getQueryAndArgs('mji.読み.glob', 'か*')
    assert.ok(query.includes('mji_reading.読み glob'))
    assert.deepEqual(args, ['か*'])
  })

  test('supports unihan variant keys and U+ fallback arg expansion', () => {
    const [query, args] = getQueryAndArgs('unihan.kTraditionalVariant', 'U+9280')
    assert.ok(query.includes("property = 'kTraditionalVariant'"))
    assert.equal(args.length, 2)
    assert.deepEqual(args, ['U+9280', 'U+9280'])
  })

  test('supports unihan.kStrange category key resolution', () => {
    const [query, args] = getQueryAndArgs('unihan.kStrange.I', 'U+9F8D')
    assert.ok(query.includes('FROM unihan_strange'))
    assert.ok(query.includes("category = 'I'"))
    assert.deepEqual(args, ['U+9F8D', 'U+9F8D'])

    const [query2, args2] = getQueryAndArgs('unihan.kStrange.I.glob', '龍*')
    assert.ok(query2.includes("ifnull(value, '') glob ?"))
    assert.deepEqual(args2, ['龍*'])
  })

  test('supports .ne and .notGlob key resolution', () => {
    const [neQuery, neArgs] = getQueryAndArgs('unihan.kTraditionalVariant.ne', '線')
    assert.ok(neQuery.includes('SELECT DISTINCT UCS AS r'))
    assert.ok(neQuery.includes('FROM ids'))
    assert.ok(neQuery.includes('NOT IN'))
    assert.equal(neArgs.length, 2)

    const [notGlobQuery, notGlobArgs] = getQueryAndArgs('mji.読み.notGlob', 'か*')
    assert.ok(notGlobQuery.includes('SELECT DISTINCT UCS AS r'))
    assert.ok(notGlobQuery.includes('FROM ids'))
    assert.ok(notGlobQuery.includes('NOT IN'))
    assert.deepEqual(notGlobArgs, ['か*'])
  })

  test('supports newly added unihan property keys', () => {
    const keys = [
      'unihan.kIRG_JSource',
      'unihan.kIRG_USource',
      'unihan.kDefinition',
      'unihan.kJapaneseOn',
      'unihan.kAccountingNumeric',
      'unihan.kAccountingNumeric.ge',
      'unihan.kZhuangNumeric.le',
      'unihan.kCompatibilityVariant',
      'unihan.kSpecializedSemanticVariant',
      'unihan.kZVariant',
    ]
    for (const key of keys) {
      const [query] = getQueryAndArgs(key, 'dummy')
      assert.ok(query.includes('SELECT DISTINCT UCS AS r'))
    }
  })
})
