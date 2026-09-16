// Apply frontier restrictions before expanding Unicode values or joining MJ rows.
// The final predicate remains authoritative: value_ref is only a candidate index.
const sourceFilter = "UCS IN (SELECT UCS FROM unihan_sources)"

// D1 limits the number of SELECT terms in a runtime compound query. Keep
// each group small and materialized so flattening cannot recreate a large UNION.
function groupedUnion(name: string, branches: string[]) {
  const groups: string[] = []
  const selects: string[] = []
  for (let start = 0; start < branches.length; start += 4) {
    const group = `${name}_${start / 4}`
    groups.push(`${group} AS MATERIALIZED (${branches.slice(start, start + 4).join("\nUNION ALL\n")})`)
    selects.push(`SELECT * FROM ${group}`)
  }
  return `${groups.join(",\n")},\n${name} AS MATERIALIZED (${selects.join("\nUNION ALL\n")})`
}

const variantQueries = [
  "kCompatibilityVariant", "kSemanticVariant", "kSimplifiedVariant",
  "kSpecializedSemanticVariant", "kSpoofingVariant", "kTraditionalVariant", "kZVariant",
  "kJoyoKanji", "kJinmeiyoKanji",
].map(property => {
  const value = property === "kJinmeiyoKanji" ? "substr(value, 6)" : "value"
  const restriction = property === "kJoyoKanji" ? " AND value GLOB 'U+*'"
    : property === "kJinmeiyoKanji" ? " AND value GLOB '20??:U+*'" : ""
  const table = ["kCompatibilityVariant", "kJoyoKanji", "kJinmeiyoKanji"].includes(property)
    ? `unihan_${property}` : `unihan_each_${property}`
  return `SELECT UCS, '${property}' AS property, ${value} AS value
    FROM ${table} WHERE (${sourceFilter})${restriction}`
})

const decodeHex = `(SELECT char(sum((unicode(json_extract('"\\u01' || e.value || '"', '$')) & 0xFF) << (8 * (2 - e.key))))
  FROM json_each(json_array(substr(hex, 1, 2), substr(hex, 3, 2), substr(hex, 5, 2))) AS e)`

// Match the eight non-Ministry-of-Justice branches of the mjsm view.
// The fallback MJ lookup explicitly uses the character index: SQLite otherwise
// prefers scanning all rows whose implemented UCS is NULL.
const mjQueries = [
  "JIS包摂規準UCS統合規則", "戸籍統一文字情報_親字正字",
  "民一2842号通達別表_誤字俗字正字一覧表_俗字",
  "民一2842号通達別表_誤字俗字正字一覧表_別字",
  "民一2842号通達別表_誤字俗字正字一覧表_無印",
  "民二5202号通知別表_正字俗字等対照表", "読み字形による類推", "辞書類等による関連字",
].flatMap(table => [
  "mjsm.MJ文字図形名 IN (SELECT MJ文字図形名 FROM mj_sources)",
  "mjsm.縮退UCS IN (SELECT value FROM args)",
].map(predicate => `SELECT ifnull(mji.実装したUCS, mji.対応するUCS) AS c1,
    mjsm.縮退UCS AS c2, '${table}' AS r
  FROM "mjsm_${table}" AS mjsm JOIN mji ON mjsm.MJ文字図形名 = mji.MJ文字図形名
  WHERE ${table === "戸籍統一文字情報_親字正字" ? "ifnull(mjsm.ホップ数, 1) < 2 AND " : ""}${predicate}`))

export const mojidataVariantEdgeQueries = [`
WITH
  args (value) AS (SELECT j.value FROM json_each(@args) AS j),
  unihan_sources (UCS) AS MATERIALIZED (
    SELECT value FROM args
    UNION
    SELECT UCS FROM unihan_value_ref WHERE ref IN (SELECT value FROM args)
  ),
  mj_sources (MJ文字図形名) AS MATERIALIZED (
    SELECT MJ文字図形名 FROM mji WHERE 実装したUCS IN (SELECT value FROM args)
    UNION ALL
    SELECT MJ文字図形名 FROM mji INDEXED BY mji_対応するUCS
    WHERE 実装したUCS IS NULL AND 対応するUCS IN (SELECT value FROM args)
  ),
  ${groupedUnion("variant_raw", variantQueries)},
  variant_tokens AS (
    SELECT UCS, property,
      CASE WHEN instr(j.value, '<') THEN substr(j.value, 1, instr(j.value, '<') - 1) ELSE j.value END AS token
    FROM variant_raw JOIN json_each('["' || replace(variant_raw.value, ' ', '","') || '"]') AS j
  ),
  variant_hex AS (
    SELECT UCS, property, substr('00' || substr(token, 3), -6) AS hex FROM variant_tokens
  ),
  variant_values AS MATERIALIZED (
    SELECT UCS, property, ${decodeHex} AS value FROM variant_hex
  ),
  strange_tokens AS (
    SELECT t.UCS, substr(j.value, 1, 1) AS category, k.value AS token
    FROM (SELECT * FROM unihan_each_kStrange WHERE ${sourceFilter}) AS t
    JOIN json_each('["' || replace(t.value, ' ', '","') || '"]') AS j
    LEFT JOIN json_each('["' || replace(substr(j.value, 3), ':', '","') || '"]') AS k ON k.value <> ''
  ),
  strange_hex AS (
    SELECT UCS, category, token,
      CASE WHEN token GLOB 'U+*' THEN substr('00' || substr(token, 3), -6) END AS hex
    FROM strange_tokens
  ),
  strange_values AS (
    SELECT UCS, category, ifnull(CASE WHEN hex IS NOT NULL THEN ${decodeHex} END, token) AS value
    FROM strange_hex
  ),
  ${groupedUnion("mj_edges", mjQueries)},
  rels (c1, c2, r) AS MATERIALIZED (
    SELECT UCS AS c1, value AS c2, property AS r FROM variant_values
    UNION ALL
    SELECT UCS AS c1, value AS c2, 'kStrange_' || category AS r FROM strange_values
    WHERE category IN ('F', 'M', 'O', 'R', 'I') AND value IS NOT NULL
    UNION ALL
    SELECT c1, c2, r FROM mj_edges
    UNION ALL
    SELECT 簡体字等のUCS AS c1, 正字のUCS AS c2, '入管正字_' || 正字の種類 || '_第' || 順位 || '順位' AS r
    FROM nyukan
    WHERE 簡体字等のUCS IS NOT NULL
      AND (簡体字等のUCS IN (SELECT value FROM args) OR 正字のUCS IN (SELECT value FROM args))
  )
SELECT c1, c2, r FROM rels
WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
`, `
WITH
  args (value) AS (SELECT j.value FROM json_each(@args) AS j),
  rels (c1, c2, r) AS MATERIALIZED (
    SELECT DISTINCT 書きかえる漢字 AS c1, 書きかえた漢字 AS c2, '同音の漢字による書きかえ' AS r
    FROM doon WHERE 書きかえる漢字 IN (SELECT value FROM args) OR 書きかえた漢字 IN (SELECT value FROM args)
    UNION ALL
    SELECT 康熙字典体 AS c1, 漢字 AS c2, '常用漢字表_新字体' AS r
    FROM joyo_kangxi WHERE 康熙字典体 IN (SELECT value FROM args) OR 漢字 IN (SELECT value FROM args)
    UNION ALL
    SELECT subject AS c1, object AS c2, 'cjkvi/duplicate' AS r
    FROM "kdpv_cjkvi/duplicate"
    WHERE length(subject) = 1 AND length(object) = 1
      AND (subject IN (SELECT value FROM args) OR object IN (SELECT value FROM args))
    UNION ALL
    SELECT subject AS c1, object AS c2, 'cjkvi/non-cognate' AS r
    FROM "kdpv_cjkvi/non-cognate"
    WHERE length(subject) = 1 AND length(object) = 1
      AND (subject IN (SELECT value FROM args) OR object IN (SELECT value FROM args))
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
      AND (subject IN (SELECT value FROM args) OR object IN (SELECT value FROM args))
    UNION ALL
    SELECT subject AS c1, object AS c2, 'jisx0213/variant' AS r
    FROM "kdpv_jisx0213/variant"
    WHERE length(subject) = 1 AND length(object) = 1
      AND (subject IN (SELECT value FROM args) OR object IN (SELECT value FROM args))
    UNION ALL
    SELECT 异体字 AS c1, 繁体字 AS c2, 'tghb_异体字' AS r
    FROM tghb_variants
    WHERE 异体字 glob '?' AND 异体字 <> 繁体字
      AND (异体字 IN (SELECT value FROM args) OR 繁体字 IN (SELECT value FROM args))
    UNION ALL
    SELECT 繁体字 AS c1, 规范字 AS c2, 'tghb_规范字' AS r
    FROM tghb_variants
    WHERE 繁体字 IN (SELECT value FROM args) OR 规范字 IN (SELECT value FROM args)
  )
SELECT c1, c2, r FROM rels
WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
`] as const

// value_ref indexes individual non-Latin-1 characters. Preserve the original
// behavior for other inputs by decoding all Unihan sources in that rare case.
export function getMojidataVariantEdgeQueries(chars: string[]) {
  return chars.every(char => [...char].length === 1 && char.codePointAt(0)! > 255)
    ? mojidataVariantEdgeQueries
    : [mojidataVariantEdgeQueries[0].split(sourceFilter).join("1"), ...mojidataVariantEdgeQueries.slice(1)]
}
