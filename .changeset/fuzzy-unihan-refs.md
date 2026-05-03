---
"@mandel59/mojidata": minor
"@mandel59/mojidata-api-core": patch
"@mandel59/mojidata-api": patch
"@mandel59/mojidata-cli": patch
---

Add a generated `unihan_value_ref` reverse lookup table and use it for
`unihan_fts` queries so D1-backed `/api/v1/mojidata` requests no longer scan the
full Unihan value table.
