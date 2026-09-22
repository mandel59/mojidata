INSERT INTO "unihan_variant" ("UCS", "property", "value", "additional_data")
WITH u AS (
  SELECT
    "UCS",
    'kJapaneseNewVariant' AS "property",
    CASE WHEN instr(e.value, '<') THEN substr(e.value, 1, instr(e.value, '<') - 1) ELSE e.value END AS raw_value,
    CASE WHEN instr(e.value, '<') THEN substr(e.value, instr(e.value, '<') + 1) END AS additional_data
  FROM (SELECT UCS, value FROM "unihan_kJapaneseNewVariant") AS k
  JOIN json_each('["' || replace(k.value, ' ', '","') || '"]') AS e
), t AS (
  SELECT "UCS", "property", "additional_data", substr('00' || substr(raw_value, 3), -6) AS value_hex
  FROM u
)
SELECT
  "UCS",
  "property",
  char(
    (instr('0123456789ABCDEF', substr(value_hex, 1, 1)) - 1) * 1048576 +
    (instr('0123456789ABCDEF', substr(value_hex, 2, 1)) - 1) * 65536 +
    (instr('0123456789ABCDEF', substr(value_hex, 3, 1)) - 1) * 4096 +
    (instr('0123456789ABCDEF', substr(value_hex, 4, 1)) - 1) * 256 +
    (instr('0123456789ABCDEF', substr(value_hex, 5, 1)) - 1) * 16 +
    (instr('0123456789ABCDEF', substr(value_hex, 6, 1)) - 1)
  ) AS "value",
  "additional_data"
FROM t;
INSERT INTO "unihan_variant" ("UCS", "property", "value", "additional_data")
WITH u AS (
  SELECT
    "UCS",
    'kJapaneseOldVariant' AS "property",
    CASE WHEN instr(e.value, '<') THEN substr(e.value, 1, instr(e.value, '<') - 1) ELSE e.value END AS raw_value,
    CASE WHEN instr(e.value, '<') THEN substr(e.value, instr(e.value, '<') + 1) END AS additional_data
  FROM (SELECT UCS, value FROM "unihan_kJapaneseOldVariant") AS k
  JOIN json_each('["' || replace(k.value, ' ', '","') || '"]') AS e
), t AS (
  SELECT "UCS", "property", "additional_data", substr('00' || substr(raw_value, 3), -6) AS value_hex
  FROM u
)
SELECT
  "UCS",
  "property",
  char(
    (instr('0123456789ABCDEF', substr(value_hex, 1, 1)) - 1) * 1048576 +
    (instr('0123456789ABCDEF', substr(value_hex, 2, 1)) - 1) * 65536 +
    (instr('0123456789ABCDEF', substr(value_hex, 3, 1)) - 1) * 4096 +
    (instr('0123456789ABCDEF', substr(value_hex, 4, 1)) - 1) * 256 +
    (instr('0123456789ABCDEF', substr(value_hex, 5, 1)) - 1) * 16 +
    (instr('0123456789ABCDEF', substr(value_hex, 6, 1)) - 1)
  ) AS "value",
  "additional_data"
FROM t;
