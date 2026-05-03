import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createSqlApiDb } from '../api/v1/_lib/mojidata-api-db-sql'
import type { SqlExecutor, SqlParams } from '../api/v1/_lib/sql-executor'
import { tokenizeIdsList } from '../api/v1/_lib/idsfind-tokenize'

type QueryCall = {
  sql: string
  params?: SqlParams
}

function createRecordingExecutor({
  query,
  queryOne,
}: {
  query?: (sql: string, params?: SqlParams) => Promise<Record<string, unknown>[]>
  queryOne?: (sql: string, params?: SqlParams) => Promise<Record<string, unknown> | null>
} = {}) {
  const queryCalls: QueryCall[] = []
  const queryOneCalls: QueryCall[] = []

  const executor: SqlExecutor = {
    async query(sql, params) {
      queryCalls.push({ sql, params })
      return (await query?.(sql, params)) ?? []
    },
    async queryOne(sql, params) {
      queryOneCalls.push({ sql, params })
      return (await queryOne?.(sql, params)) ?? null
    },
  }

  return { executor, queryCalls, queryOneCalls }
}

describe('createSqlApiDb', () => {
  test('getMojidataJson delegates to queryOne() with @ucs', async () => {
    const mojidata = createRecordingExecutor({
      queryOne: async () => ({ vs: '{"char":"漢"}' }),
    })
    const idsfind = createRecordingExecutor()
    const db = createSqlApiDb({
      getMojidataDb: async () => mojidata.executor,
      getIdsfindDb: async () => idsfind.executor,
    })

    const result = await db.getMojidataJson('漢', ['char'])

    assert.equal(result, '{"char":"漢"}')
    assert.equal(mojidata.queryOneCalls.length, 1)
    assert.deepEqual(mojidata.queryOneCalls[0]?.params, { '@ucs': '漢' })
    assert.match(mojidata.queryOneCalls[0]?.sql ?? '', /SELECT json_object/)
  })

  test('getIvsList filters out malformed rows', async () => {
    const mojidata = createRecordingExecutor({
      query: async () => [
        {
          IVS: '漢\udb40\udd00',
          unicode: '6F22 E0100',
          collection: 'Example',
          code: '001',
        },
        {
          IVS: 'invalid',
          unicode: 'not-enough-fields',
          collection: 'Example',
        },
      ],
    })
    const idsfind = createRecordingExecutor()
    const db = createSqlApiDb({
      getMojidataDb: async () => mojidata.executor,
      getIdsfindDb: async () => idsfind.executor,
    })

    const result = await db.getIvsList('漢')

    assert.deepEqual(result, [
      {
        IVS: '漢\udb40\udd00',
        unicode: '6F22 E0100',
        collection: 'Example',
        code: '001',
      },
    ])
    assert.deepEqual(mojidata.queryCalls[0]?.params, { '@ucs': '漢' })
    assert.match(mojidata.queryCalls[0]?.sql ?? '', /FROM ivs/)
  })

  test('getMojidataVariantRels serializes args and filters malformed rows', async () => {
    const mojidata = createRecordingExecutor({
      query: async () => [
        { c1: '漢', c2: '漢', f: 1, r: 'kSemanticVariant' },
        { c1: '漢', c2: 'bad', r: 'missing-flag' },
      ],
    })
    const idsfind = createRecordingExecutor()
    const db = createSqlApiDb({
      getMojidataDb: async () => mojidata.executor,
      getIdsfindDb: async () => idsfind.executor,
    })

    const result = await db.getMojidataVariantRels(['漢', '漢'])

    assert.deepEqual(result, [
      { c1: '漢', c2: '漢', f: 1, r: 'kSemanticVariant' },
    ])
    assert.deepEqual(mojidata.queryCalls[0]?.params, {
      '@args': JSON.stringify(['漢', '漢']),
    })
    assert.match(mojidata.queryCalls[0]?.sql ?? '', /WITH RECURSIVE/)
  })

  test('idsfindDebugQuery uses tokenized idslist in the idsfind executor', async () => {
    const mojidata = createRecordingExecutor()
    const idsfind = createRecordingExecutor({
      query: async () => [{ UCS: '信', matched: 1 }],
    })
    const db = createSqlApiDb({
      getMojidataDb: async () => mojidata.executor,
      getIdsfindDb: async () => idsfind.executor,
    })

    const result = await db.idsfindDebugQuery('x', ['⿰亻言'])

    assert.deepEqual(result, [{ UCS: '信', matched: 1 }])
    assert.equal(idsfind.queryCalls.length, 1)
    assert.deepEqual(idsfind.queryCalls[0]?.params, {
      $idslist: JSON.stringify(tokenizeIdsList(['⿰亻言']).forQuery),
    })
  })

  test('search() returns flattened rows from the mojidata executor', async () => {
    const mojidata = createRecordingExecutor({
      query: async () => [{ r: '一' }, { r: '丁' }],
    })
    const idsfind = createRecordingExecutor()
    const db = createSqlApiDb({
      getMojidataDb: async () => mojidata.executor,
      getIdsfindDb: async () => idsfind.executor,
    })

    const result = await db.search(['UCS'], ['4E00'])

    assert.deepEqual(result, ['一', '丁'])
    assert.deepEqual(mojidata.queryCalls[0]?.params, ['一', '1'])
    assert.doesNotMatch(mojidata.queryCalls[0]?.sql ?? '', /parse_int|regexp/)
  })

  test('getMojidataJson computes unihan_rs outside SQL regexp_all', async () => {
    const mojidata = createRecordingExecutor({
      query: async (sql, params) => {
        if (sql.includes('FROM radicals')) {
          assert.deepEqual(params, {
            '@indices': JSON.stringify([85]),
            '@radicals': JSON.stringify(['85']),
          })
          return [
            { 部首: 85, 部首漢字: '水', radical: '85', radical_CJKUI: '水' },
          ]
        }
        throw new Error(`Unexpected query: ${sql}`)
      },
      queryOne: async (sql) => {
        if (sql.includes('SELECT json_object(')) {
          assert.doesNotMatch(sql, /regexp_all/)
          return { vs: '{}' }
        }
        if (sql.includes('FROM unihan_kRSAdobe_Japan1_6')) {
          return { value: 'C+1533+85.3.10' }
        }
        if (sql.includes('FROM unihan_kRSUnicode')) {
          return { value: '85.11' }
        }
        throw new Error(`Unexpected queryOne: ${sql}`)
      },
    })
    const idsfind = createRecordingExecutor()
    const db = createSqlApiDb({
      getMojidataDb: async () => mojidata.executor,
      getIdsfindDb: async () => idsfind.executor,
    })

    const result = await db.getMojidataJson('漢', ['unihan_rs'])

    assert.deepEqual(JSON.parse(result ?? 'null'), {
      unihan_rs: {
        kRSAdobe_Japan1_6: [[85, 10, '水', 3, 'CID+1533']],
        kRSUnicode: [[85, 11, '水', '85']],
      },
    })
  })

  test('getMojidataJson uses the Unihan reverse lookup table for unihan_fts', async () => {
    const mojidata = createRecordingExecutor({
      queryOne: async () => ({ vs: '{"unihan_fts":[]}' }),
    })
    const idsfind = createRecordingExecutor()
    const db = createSqlApiDb({
      getMojidataDb: async () => mojidata.executor,
      getIdsfindDb: async () => idsfind.executor,
    })

    const result = await db.getMojidataJson('漢', ['unihan_fts'])

    assert.equal(result, '{"unihan_fts":[]}')
    const sql = mojidata.queryOneCalls[0]?.sql ?? ''
    assert.match(sql, /FROM unihan_value_ref/)
    assert.doesNotMatch(sql, /unihan\.value glob|FROM unihan\s/)
  })
})
