import type { SqlExecutor } from "./sql-executor"

type QueryAndArgs = [string, string[]]

type QuerySpec = {
  query: string
  args?: (q: string) => string[]
}

const ucsSearchCharPattern = /^[\p{L}\p{N}\p{S}]$/u

function parseUnicodeCodePoint(q: string): number | null {
  const match = /^(?:U\+)?([0-9A-Fa-f]{1,6})$/.exec(q.trim())
  if (!match) return null
  const codePoint = Number.parseInt(match[1], 16)
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return null
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return null
  }
  return codePoint
}

export function normalizeUcsQueryChar(q: string): string | null {
  const codePoint = parseUnicodeCodePoint(q)
  if (codePoint == null) {
    return null
  }
  return String.fromCodePoint(codePoint)
}

function withNormalizedUcsChar(q: string): [string, string] {
  return [q, normalizeUcsQueryChar(q) ?? q]
}

function withNormalizedTokenArgs(q: string): [string, string, string, string, string] {
  return [q, normalizeUcsQueryChar(q) ?? q, q, q, q]
}

function getUcsSearchArgs(q: string): [string, string] {
  const char = normalizeUcsQueryChar(q)
  if (char != null && ucsSearchCharPattern.test(char)) {
    return [char, "1"]
  }
  return ["", "0"]
}

const queries: Partial<Record<string, QuerySpec>> = {
  UCS: {
    query: `SELECT ? AS r WHERE cast(? as integer) = 1`,
    args: getUcsSearchArgs,
  },
  'mji.読み': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
      JOIN mji_reading USING (MJ文字図形名)
    WHERE mji.対応するUCS IS NOT NULL
      AND mji_reading.読み = ?`,
  },
  'mji.読み.prefix': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
      JOIN mji_reading USING (MJ文字図形名)
    WHERE mji.対応するUCS IS NOT NULL
      AND mji_reading.読み glob (replace(?, '*', '') || '*')`,
  },
  'mji.読み.glob': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
      JOIN mji_reading USING (MJ文字図形名)
    WHERE mji.対応するUCS IS NOT NULL
      AND mji_reading.読み glob ?`,
  },
  'mji.総画数': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 = cast(? as integer)`,
  },
  'mji.総画数.lt': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 < cast(? as integer)`,
  },
  'mji.総画数.le': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 <= cast(? as integer)`,
  },
  'mji.総画数.gt': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 > cast(? as integer)`,
  },
  'mji.総画数.ge': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 >= cast(? as integer)`,
  },
  'mji.MJ文字図形名': {
    query: `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.MJ文字図形名 = ?`,
  },
  'unihan.kTotalStrokes': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) = cast(? as integer)`,
  },
  'unihan.kTotalStrokes.lt': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) < cast(? as integer)`,
  },
  'unihan.kTotalStrokes.le': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) <= cast(? as integer)`,
  },
  'unihan.kTotalStrokes.gt': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) > cast(? as integer)`,
  },
  'unihan.kTotalStrokes.ge': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) >= cast(? as integer)`,
  },
  'unihan.kTraditionalVariant': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kTraditionalVariant'
      AND (value = ? OR value = ?)`,
    args: withNormalizedUcsChar,
  },
  'unihan.kSimplifiedVariant': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kSimplifiedVariant'
      AND (value = ? OR value = ?)`,
    args: withNormalizedUcsChar,
  },
  'unihan.kSemanticVariant': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kSemanticVariant'
      AND (value = ? OR value = ?)`,
    args: withNormalizedUcsChar,
  },
  'unihan.kTraditionalVariant.glob': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kTraditionalVariant'
      AND value glob ?`,
  },
  'unihan.kSimplifiedVariant.glob': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kSimplifiedVariant'
      AND value glob ?`,
  },
  'unihan.kSemanticVariant.glob': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kSemanticVariant'
      AND value glob ?`,
  },
}

function addUnihanVariantProperty(property: string) {
  queries[`unihan.${property}`] = {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = '${property}'
      AND (value = ? OR value = ?)`,
    args: withNormalizedUcsChar,
  }
  queries[`unihan.${property}.glob`] = {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = '${property}'
      AND value glob ?`,
  }
}

for (const property of [
  'kCompatibilityVariant',
  'kSemanticVariant',
  'kSimplifiedVariant',
  'kSpecializedSemanticVariant',
  'kSpoofingVariant',
  'kTraditionalVariant',
  'kZVariant',
]) {
  addUnihanVariantProperty(property)
}

const unihanGeneralProperties = [
  'kIICore',
  'kIRG_GSource',
  'kIRG_HSource',
  'kIRG_JSource',
  'kIRG_KPSource',
  'kIRG_KSource',
  'kIRG_MSource',
  'kIRG_SSource',
  'kIRG_TSource',
  'kIRG_UKSource',
  'kIRG_USource',
  'kIRG_VSource',
  'kRSUnicode',
  'kTotalStrokes',
  'kAccountingNumeric',
  'kOtherNumeric',
  'kPrimaryNumeric',
  'kTayNumeric',
  'kVietnameseNumeric',
  'kZhuangNumeric',
  'kCantonese',
  'kDefinition',
  'kFanqie',
  'kHangul',
  'kHanyuPinlu',
  'kHanyuPinyin',
  'kJapanese',
  'kJapaneseKun',
  'kJapaneseOn',
  'kKorean',
  'kMandarin',
  'kSMSZD2003Readings',
  'kTang',
  'kTGHZ2013',
  'kVietnamese',
  'kXHC1983',
  'kZhuang',
]

for (const property of unihanGeneralProperties) {
  if (queries[`unihan.${property}`]) continue
  queries[`unihan.${property}`] = {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan
    WHERE property = '${property}'
      AND (
        value = ?
        OR value = ?
        OR value glob (? || ' *')
        OR value glob ('* ' || ? || ' *')
        OR value glob ('* ' || ?)
      )`,
    args: withNormalizedTokenArgs,
  }
  queries[`unihan.${property}.glob`] = {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan
    WHERE property = '${property}'
      AND value glob ?`,
  }
}

for (const property of [
  'kTotalStrokes',
  'kAccountingNumeric',
  'kOtherNumeric',
  'kPrimaryNumeric',
  'kTayNumeric',
  'kVietnameseNumeric',
  'kZhuangNumeric',
]) {
  for (const [suffix, op] of [
    ['lt', '<'],
    ['le', '<='],
    ['gt', '>'],
    ['ge', '>='],
  ] as const) {
    if (queries[`unihan.${property}.${suffix}`]) continue
    queries[`unihan.${property}.${suffix}`] = {
      query: `
      SELECT DISTINCT UCS AS r
      FROM unihan_${property}
      WHERE cast(value as integer) ${op} cast(? as integer)`,
    }
  }
}

const strangeCategories = ['A', 'B', 'C', 'H', 'I', 'K', 'M', 'O', 'R', 'S', 'U', 'Y'] as const

for (const c of strangeCategories) {
  queries[`unihan.kStrange.${c}`] = {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_strange
    WHERE category = '${c}'
      AND (value = ? OR value = ?)`,
    args: withNormalizedUcsChar,
  }
  queries[`unihan.kStrange.${c}.glob`] = {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_strange
    WHERE category = '${c}'
      AND ifnull(value, '') glob ?`,
  }
}

queries['unihan.kStrange'] = {
  query: `
  SELECT DISTINCT UCS AS r
  FROM unihan_strange
  WHERE value = ? OR value = ?`,
  args: withNormalizedUcsChar,
}

queries['unihan.kStrange.glob'] = {
  query: `
  SELECT DISTINCT UCS AS r
  FROM unihan_strange
  WHERE ifnull(value, '') glob ?`,
}

const queries2: Partial<Record<string, string>> = {
  totalStrokes: `SELECT * FROM (${queries[
    'unihan.kTotalStrokes'
  ]!.query.trim()} UNION ${queries['mji.総画数']!.query.trim()})`,
  'totalStrokes.lt': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.lt'
  ]!.query.trim()} UNION ${queries['mji.総画数.lt']!.query.trim()})`,
  'totalStrokes.le': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.le'
  ]!.query.trim()} UNION ${queries['mji.総画数.le']!.query.trim()})`,
  'totalStrokes.gt': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.gt'
  ]!.query.trim()} UNION ${queries['mji.総画数.gt']!.query.trim()})`,
  'totalStrokes.ge': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.ge'
  ]!.query.trim()} UNION ${queries['mji.総画数.ge']!.query.trim()})`,
}

function normalizeQueryKey(p: string): string {
  if (!p.endsWith('.eq')) return p
  const withoutEq = p.slice(0, -3)
  if (queries[withoutEq] || queries2[withoutEq]) return withoutEq
  return p
}

function getPositiveQueryAndArgs(p: string, q: string): QueryAndArgs {
  const key = normalizeQueryKey(p)
  const query = queries[key]
  if (query) {
    return [query.query.trim(), query.args ? query.args(q) : [q]]
  }
  const query2 = queries2[key]
  if (query2) {
    return [query2.trim(), [q, q]]
  }
  throw new Error(`Unknown query key: ${p}`)
}

function negateQuery(query: string): string {
  return `
    SELECT DISTINCT UCS AS r
    FROM ids
    WHERE UCS NOT IN (${query})
  `.trim()
}

export function getQueryAndArgs(p: string, q: string): QueryAndArgs {
  if (p.endsWith('.ne')) {
    const base = p.slice(0, -3)
    const [query, args] = getPositiveQueryAndArgs(base, q)
    return [negateQuery(query), args]
  }
  if (p.endsWith('.notGlob')) {
    const base = p.slice(0, -8)
    const [query, args] = getPositiveQueryAndArgs(`${base}.glob`, q)
    return [negateQuery(query), args]
  }
  return getPositiveQueryAndArgs(p, q)
}

async function pluckAll(getDb: () => Promise<SqlExecutor>, query: string, args: unknown[]) {
  const db = await getDb()
  const rows = await db.query<{ r?: string }>(query, args)
  return rows.flatMap((row) => (typeof row.r === 'string' ? [row.r] : []))
}

export function createLibSearch(getDb: () => Promise<SqlExecutor>) {
  return {
    filterChars: async (chars: string[], ps: string[], qs: string[]) => {
      const queryAndArgs = ps.map((p, i) => getQueryAndArgs(p, qs[i]))
      const query = `WITH c(char) AS (select value from json_each(?))
        SELECT c.char AS r
        FROM c
        WHERE ${queryAndArgs
          .map(([query, _args]) => `c.char IN (${query})`)
          .join(' AND ')}`
      const args = ([] as string[]).concat(
        ...queryAndArgs.map(([_query, args]) => args),
      )
      return await pluckAll(getDb, query, [JSON.stringify(chars), ...args])
    },
    search: async (ps: string[], qs: string[]) => {
      const queryAndArgs = ps.map((p, i) => getQueryAndArgs(p, qs[i]))
      const query = queryAndArgs
        .map(([query, _args]) => query)
        .join('\nINTERSECT\n')
      const args = ([] as string[]).concat(
        ...queryAndArgs.map(([_query, args]) => args),
      )
      return await pluckAll(getDb, query, args)
    },
  }
}
