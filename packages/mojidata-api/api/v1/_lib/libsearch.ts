import type { Database } from "sql.js"

type QueryAndArgs = [string, string[]]

type QuerySpec = {
  query: string
  args?: (q: string) => string[]
}

const queries: Partial<Record<string, QuerySpec>> = {
  UCS: {
    query: `WITH x(x) AS (VALUES (parse_int(?, 16))) SELECT DISTINCT char(x) AS r FROM x WHERE char(x) regexp '^[\\p{L}\\p{N}\\p{S}]$'`,
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
      AND (value = ? OR value = char(parse_int(replace(upper(?), 'U+', ''), 16)))`,
    args: (q) => [q, q],
  },
  'unihan.kSimplifiedVariant': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kSimplifiedVariant'
      AND (value = ? OR value = char(parse_int(replace(upper(?), 'U+', ''), 16)))`,
    args: (q) => [q, q],
  },
  'unihan.kSemanticVariant': {
    query: `
    SELECT DISTINCT UCS AS r
    FROM unihan_variant
    WHERE property = 'kSemanticVariant'
      AND (value = ? OR value = char(parse_int(replace(upper(?), 'U+', ''), 16)))`,
    args: (q) => [q, q],
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

export function getQueryAndArgs(p: string, q: string): QueryAndArgs {
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

async function pluckAll(getDb: () => Promise<Database>, query: string, args: unknown[]) {
  const db = await getDb()
  const stmt = db.prepare(query)
  stmt.bind(args as any)
  const out: string[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as { r?: string }
    if (typeof row.r === 'string') out.push(row.r)
  }
  stmt.free()
  return out
}

export function createLibSearch(getDb: () => Promise<Database>) {
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
