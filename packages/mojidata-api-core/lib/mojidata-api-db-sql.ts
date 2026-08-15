import type { MojidataApiDb } from "./mojidata-api-db"
import { createIdsfind } from "./idsfind-sql"
import { makeIdsfindQuery } from "./idsfind-query"
import { tokenizeIdsList } from "./idsfind-tokenize"
import { createLibSearch } from "./libsearch"
import {
  buildMojidataSelectQuery,
  mojidataComputedFieldNames,
} from "./mojidata-query"
import type { SqlExecutor } from "./sql-executor"
import { buildUnihanRsValue } from "./unihan-rs"

type DbProvider = () => Promise<SqlExecutor>

const ivsListQuery = `
  SELECT
    IVS,
    printf('%04X %04X', unicode(IVS), unicode(substr(IVS, 2))) AS unicode,
    collection,
    code
  FROM ivs
  WHERE IVS >= @ucs AND IVS < char(unicode(@ucs) + 1)
`

// Copied from `packages/mojidata-cli/bin/mojidata-variants.ts` (better-sqlite3),
// adapted for SQLite-based executors.
const mojidataVariantEdgeQueries = [`
WITH
  args (value) AS (SELECT j.value FROM json_each(@args) AS j),
  rels (c1, c2, r) AS MATERIALIZED (
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
  )
SELECT c1, c2, r FROM rels
WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
`, `
WITH
  args (value) AS (SELECT j.value FROM json_each(@args) AS j),
  rels (c1, c2, r) AS MATERIALIZED (
    SELECT DISTINCT 書きかえる漢字 AS c1, 書きかえた漢字 AS c2, '同音の漢字による書きかえ' AS r
    FROM doon
    UNION ALL
    SELECT 康熙字典体 AS c1, 漢字 AS c2, '常用漢字表_新字体' AS r
    FROM joyo_kangxi
    UNION ALL
    SELECT subject AS c1, object AS c2, 'cjkvi/duplicate' AS r
    FROM "kdpv_cjkvi/duplicate"
    WHERE length(subject) = 1 AND length(object) = 1
    UNION ALL
    SELECT subject AS c1, object AS c2, 'cjkvi/non-cognate' AS r
    FROM "kdpv_cjkvi/non-cognate"
    WHERE length(subject) = 1 AND length(object) = 1
  )
SELECT c1, c2, r FROM rels
WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
`, `
WITH
  args (value) AS (SELECT j.value FROM json_each(@args) AS j),
  rels (c1, c2, r) AS MATERIALIZED (
    SELECT subject AS c1, object AS c2, 'jisx0212/variant' AS r
    FROM "kdpv_jisx0212/variant"
    WHERE length(subject) = 1 AND length(object) = 1
    UNION ALL
    SELECT subject AS c1, object AS c2, 'jisx0213/variant' AS r
    FROM "kdpv_jisx0213/variant"
    WHERE length(subject) = 1 AND length(object) = 1
    UNION ALL
    SELECT 异体字 AS c1, 繁体字 AS c2, 'tghb_异体字' AS r
    FROM tghb_variants
    WHERE 异体字 glob '?' AND 异体字 <> 繁体字
    UNION ALL
    SELECT 繁体字 AS c1, 规范字 AS c2, 'tghb_规范字' AS r
    FROM tghb_variants
  )
SELECT c1, c2, r FROM rels
WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
`] as const

const weakVariantRelations = new Set([
  'kSpoofingVariant',
  'kSpecializedSemanticVariant',
  '民一2842号通達別表_誤字俗字正字一覧表_別字',
  '入管正字_類字_第1順位',
  '入管正字_類字_第2順位',
  '同音の漢字による書きかえ',
  'cjkvi/non-cognate',
])

function isStrongVariantRelation(relation: string) {
  return !weakVariantRelations.has(relation) && !/^kStrange_.$/u.test(relation)
}

export function createSqlApiDb({
  getMojidataDb,
  getIdsfindDb,
}: {
  getMojidataDb: DbProvider
  getIdsfindDb: DbProvider
}): MojidataApiDb {
  const { search, filterChars } = createLibSearch(getMojidataDb)
  const idsfind = createIdsfind(getIdsfindDb)
  const shouldIncludeComputedField = (selection: string[], field: string) =>
    selection.length === 0 || selection.includes(field)

  return {
    async getMojidataJson(char: string, select: string[]) {
      const db = await getMojidataDb()
      const query = buildMojidataSelectQuery(select)
      const row =
        (await db.queryOne<{ vs?: string }>(query, { "@ucs": char })) ?? {}
      const vs = row.vs
      if (typeof vs !== "string") {
        return null
      }
      if (![...mojidataComputedFieldNames].some((field) => shouldIncludeComputedField(select, field))) {
        return vs
      }

      const result = JSON.parse(vs) as Record<string, unknown>
      if (shouldIncludeComputedField(select, "unihan_rs")) {
        result.unihan_rs = await buildUnihanRsValue(db, char)
      }
      return JSON.stringify(result)
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
      type VariantEdgeRow = {
        c1?: string
        c2?: string
        r?: string
      }
      type VariantEdge = {
        c1: string
        c2: string
        relations: Set<string>
        strong: boolean
      }
      const edges = new Map<string, VariantEdge>()
      const expandedChars = new Set<string>()
      let frontier = [...new Set(chars)]

      while (frontier.length > 0) {
        const current = frontier.filter((char) => !expandedChars.has(char))
        if (current.length === 0) break
        current.forEach((char) => expandedChars.add(char))

        const roundEdges = new Map<string, VariantEdge>()
        for (const query of mojidataVariantEdgeQueries) {
          const rows = await db.query<VariantEdgeRow>(query, {
            "@args": JSON.stringify(current),
          })
          for (const row of rows) {
            if (
              typeof row.c1 !== "string" ||
              typeof row.c2 !== "string" ||
              typeof row.r !== "string"
            ) continue
            const key = `${row.c1}\0${row.c2}`
            const edge = roundEdges.get(key) ?? {
              c1: row.c1,
              c2: row.c2,
              relations: new Set<string>(),
              strong: false,
            }
            edge.relations.add(row.r)
            edge.strong ||= isStrongVariantRelation(row.r)
            roundEdges.set(key, edge)
          }
        }

        const next = new Set<string>()
        for (const [key, roundEdge] of roundEdges) {
          const edge = edges.get(key) ?? {
            c1: roundEdge.c1,
            c2: roundEdge.c2,
            relations: new Set<string>(),
            strong: false,
          }
          roundEdge.relations.forEach((relation) => edge.relations.add(relation))
          edge.strong ||= roundEdge.strong
          edges.set(key, edge)
          if (roundEdge.strong) {
            if (!expandedChars.has(roundEdge.c1)) next.add(roundEdge.c1)
            if (!expandedChars.has(roundEdge.c2)) next.add(roundEdge.c2)
          }
        }
        frontier = [...next]
      }

      return [...edges.values()].flatMap((edge) =>
        [...edge.relations].map((relation) => ({
          c1: edge.c1,
          c2: edge.c2,
          f: edge.strong ? 1 : 0,
          r: relation,
        })))
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
