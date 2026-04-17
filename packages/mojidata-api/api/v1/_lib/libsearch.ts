import type { SqlExecutor } from "./sql-executor"

const queries: Partial<Record<string, string>> = {
  UCS: `WITH x(x) AS (VALUES (parse_int(?, 16))) SELECT DISTINCT char(x) AS r FROM x WHERE char(x) regexp '^[\\p{L}\\p{N}\\p{S}]$'`,
  'mji.読み': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
      JOIN mji_reading USING (MJ文字図形名)
    WHERE mji.対応するUCS IS NOT NULL
      AND mji_reading.読み = ?`,
  'mji.読み.prefix': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
      JOIN mji_reading USING (MJ文字図形名)
    WHERE mji.対応するUCS IS NOT NULL
      AND mji_reading.読み glob (replace(?, '*', '') || '*')`,
  'mji.総画数': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 = cast(? as integer)`,
  'mji.総画数.lt': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 < cast(? as integer)`,
  'mji.総画数.le': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 <= cast(? as integer)`,
  'mji.総画数.gt': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 > cast(? as integer)`,
  'mji.総画数.ge': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.総画数 >= cast(? as integer)`,
  'mji.MJ文字図形名': `
    SELECT DISTINCT mji.対応するUCS AS r
    FROM mji
    WHERE mji.対応するUCS IS NOT NULL
      AND mji.MJ文字図形名 = ?`,
  'unihan.kTotalStrokes': `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) = cast(? as integer)`,
  'unihan.kTotalStrokes.lt': `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) < cast(? as integer)`,
  'unihan.kTotalStrokes.le': `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) <= cast(? as integer)`,
  'unihan.kTotalStrokes.gt': `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) > cast(? as integer)`,
  'unihan.kTotalStrokes.ge': `
    SELECT DISTINCT UCS AS r
    FROM unihan_kTotalStrokes
    WHERE cast(value as integer) >= cast(? as integer)`,
}

const queries2: Partial<Record<string, string>> = {
  totalStrokes: `SELECT * FROM (${queries[
    'unihan.kTotalStrokes'
  ]!.trim()} UNION ${queries['mji.総画数']!.trim()})`,
  'totalStrokes.lt': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.lt'
  ]!.trim()} UNION ${queries['mji.総画数.lt']!.trim()})`,
  'totalStrokes.le': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.le'
  ]!.trim()} UNION ${queries['mji.総画数.le']!.trim()})`,
  'totalStrokes.gt': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.gt'
  ]!.trim()} UNION ${queries['mji.総画数.gt']!.trim()})`,
  'totalStrokes.ge': `SELECT * FROM (${queries[
    'unihan.kTotalStrokes.ge'
  ]!.trim()} UNION ${queries['mji.総画数.ge']!.trim()})`,
}

export function getQueryAndArgs(p: string, q: string) {
  const query = queries[p]
  if (query) {
    return [query.trim(), [q]] as [string, string[]]
  }
  const query2 = queries2[p]
  if (query2) {
    return [query2.trim(), [q, q]] as [string, string[]]
  }
  throw new Error(`Unknown query key: ${p}`)
}

async function pluckAll(getDb: () => Promise<SqlExecutor>, query: string, args: unknown[]) {
  const db = await getDb()
  const rows = await db.query<{ r?: string }>(query, args)
  return rows.flatMap((row) => (typeof row.r === "string" ? [row.r] : []))
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
          .join(" AND ")}`
      const args = ([] as string[]).concat(
        ...queryAndArgs.map(([_query, args]) => args),
      )
      return await pluckAll(getDb, query, [JSON.stringify(chars), ...args])
    },
    search: async (ps: string[], qs: string[]) => {
      const queryAndArgs = ps.map((p, i) => getQueryAndArgs(p, qs[i]))
      const query = queryAndArgs
        .map(([query, _args]) => query)
        .join("\nINTERSECT\n")
      const args = ([] as string[]).concat(
        ...queryAndArgs.map(([_query, args]) => args),
      )
      return await pluckAll(getDb, query, args)
    },
  }
}
