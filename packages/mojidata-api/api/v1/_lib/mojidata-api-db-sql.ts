import type { MojidataApiDb } from "./mojidata-api-db"
import { createIdsfind } from "./idsfind-sql"
import { makeIdsfindQuery } from "./idsfind-query"
import { tokenizeIdsList } from "./idsfind-tokenize"
import { createLibSearch } from "./libsearch"
import { buildMojidataSelectQuery } from "./mojidata-query"
import type { SqlExecutor } from "./sql-executor"

type DbProvider = () => Promise<SqlExecutor>

const ivsListQuery = `
  SELECT
    IVS,
    printf('%04X %04X', unicode(IVS), unicode(substr(IVS, 2))) AS unicode,
    collection,
    code
  FROM ivs
  WHERE IVS GLOB @ucs || '*'
`

// Copied from `packages/mojidata-cli/bin/mojidata-variants.ts` (better-sqlite3),
// adapted for SQLite-based executors.
const mojidataVariantsQuery = `
WITH RECURSIVE
  args (value) AS (SELECT j.value FROM json_each(@args) AS j),
  rels (c1, c2, r) AS (
    SELECT UCS AS c1, value AS c2, property AS r
    FROM unihan_variant as unihan_variant
    UNION ALL
    SELECT UCS AS c1, value AS c2, 'kStrange_' || category AS r
    FROM unihan_strange as unihan_strange
    WHERE category IN ('F', 'M', 'O', 'R', 'I') AND value IS NOT NULL
    UNION ALL
    SELECT ifnull(mji.実装したUCS, mji.対応するUCS) AS c1, mjsm.縮退UCS AS c2, mjsm.表 AS r
    FROM mjsm
    JOIN mji ON mjsm.MJ文字図形名 = mji.MJ文字図形名
    WHERE ifnull(mjsm.ホップ数, 1) < 2 AND mjsm.表 NOT GLOB '法務省告示582号*'
    UNION ALL
    SELECT 簡体字等のUCS AS c1, 正字のUCS AS c2, '入管正字_' || 正字の種類 || '_第' || 順位 || '順位' AS r
    FROM nyukan
    WHERE 簡体字等のUCS IS NOT NULL
    UNION ALL
    SELECT DISTINCT 書きかえる漢字 AS c1, 書きかえた漢字 AS c2, '同音の漢字による書きかえ' AS r
    FROM doon
    UNION ALL
    SELECT 康熙字典体 AS c1, 漢字 AS c2, '常用漢字表_新字体' AS r
    FROM joyo_kangxi
    UNION ALL
    SELECT subject AS c1, object AS c2, rel AS r
    FROM kdpv
    WHERE rel IN (
      'cjkvi/duplicate',
      'cjkvi/non-cognate',
      'jisx0212/variant',
      'jisx0213/variant')
      AND length(subject) = 1
      AND length(object) = 1
    UNION ALL
    SELECT 异体字 AS c1, 繁体字 AS c2, 'tghb_异体字' AS r
    FROM tghb_variants
    WHERE 异体字 glob '?' AND 异体字 <> 繁体字
    UNION ALL
    SELECT 繁体字 AS c1, 规范字 AS c2, 'tghb_规范字' AS r
    FROM tghb_variants
    /* END OF UNION ALL */
    ORDER BY c1, c2, r
  ),
  t (c1, c2, rs, f) AS (
    SELECT c1, c2, json_group_array(r) AS rs,
      max(
        r NOT IN (
          'kSpoofingVariant',
          'kSpecializedSemanticVariant',
          '民一2842号通達別表_誤字俗字正字一覧表_別字',
          '入管正字_類字_第1順位',
          '入管正字_類字_第2順位',
          '同音の漢字による書きかえ',
          'cjkvi/non-cognate')
        AND r NOT GLOB 'kStrange_?'
      ) AS f
    FROM rels GROUP BY c1, c2
  ),
  u (c1, c2, rs, f) AS (
    SELECT DISTINCT c1, c2, rs, f
    FROM t
    WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
    UNION
    SELECT DISTINCT t.c1, t.c2, t.rs, t.f
    FROM u JOIN t ON u.c1 = t.c1 OR u.c1 = t.c2 OR u.c2 = t.c1 OR u.c2 = t.c2
    WHERE u.f
  )
SELECT c1, c2, f, j.value AS r FROM u JOIN json_each(u.rs) AS j
`

export function createSqlApiDb({
  getMojidataDb,
  getIdsfindDb,
}: {
  getMojidataDb: DbProvider
  getIdsfindDb: DbProvider
}): MojidataApiDb {
  const { search, filterChars } = createLibSearch(getMojidataDb)
  const idsfind = createIdsfind(getIdsfindDb)

  return {
    async getMojidataJson(char: string, select: string[]) {
      const db = await getMojidataDb()
      const query = buildMojidataSelectQuery(select)
      const row =
        (await db.queryOne<{ vs?: string }>(query, { "@ucs": char })) ?? {}
      return row.vs ?? null
    },
    async getIvsList(char: string) {
      const db = await getMojidataDb()
      const rows = await db.query<{
        IVS?: string
        unicode?: string
        collection?: string
        code?: string
      }>(ivsListQuery, { "@ucs": char })
      return rows.flatMap((row) => {
        if (
          typeof row.IVS === "string" &&
          typeof row.unicode === "string" &&
          typeof row.collection === "string" &&
          typeof row.code === "string"
        ) {
          return [
            {
              IVS: row.IVS,
              unicode: row.unicode,
              collection: row.collection,
              code: row.code,
            },
          ]
        }
        return []
      })
    },
    async getMojidataVariantRels(chars: string[]) {
      const db = await getMojidataDb()
      const rows = await db.query<{
        c1?: string
        c2?: string
        f?: number
        r?: string
      }>(mojidataVariantsQuery, { "@args": JSON.stringify(chars) })
      return rows.flatMap((row) => {
        if (
          typeof row.c1 === "string" &&
          typeof row.c2 === "string" &&
          typeof row.f === "number" &&
          typeof row.r === "string"
        ) {
          return [{ c1: row.c1, c2: row.c2, f: row.f, r: row.r }]
        }
        return []
      })
    },
    idsfind,
    async idsfindDebugQuery(queryBody: string, idslist: string[]) {
      const db = await getIdsfindDb()
      const tokenized = tokenizeIdsList(idslist)
      const query = makeIdsfindQuery(queryBody)
      return await db.query<Record<string, unknown>>(query, {
        $idslist: JSON.stringify(tokenized.forQuery),
      })
    },
    search,
    filterChars,
  }
}
