-- Extract readings from mjsm_note (except readings in mji_reading)
WITH t1 AS (
    SELECT
        mjsm_note.MJ文字図形名 AS mj,
        substr(mjsm_note.参考情報, 4) AS readings
    FROM mjsm_note
    WHERE mjsm_note.参考情報 GLOB '国字:*'
),
t2 AS (
    SELECT
        mj, r.value AS reading
    FROM
        t1
        JOIN json_each('["' || replace(replace(replace(
            readings,
            '・', '","'),
            '（', '","'),
            '）', '","') || '"]') AS r
    WHERE
        r.value NOT IN ('', '踊り字', '不明', '地名外字')
),
t3 AS (
    SELECT DISTINCT mj, reading FROM t2
    EXCEPT
    SELECT DISTINCT MJ文字図形名 AS mj, 読み AS reading FROM mji_reading
)
SELECT
    mj,
    printf('U+%04X', unicode(mji.対応するUCS)) AS codepoint,
    mji.対応するUCS AS character,
    reading
FROM t3 JOIN mji ON mj = mji.MJ文字図形名
