---
"@mandel59/mojidata": patch
"@mandel59/mojidata-api-core": patch
"@mandel59/mojidata-cli": patch
---

Optimize mojidata full-field D1 lookup SQL to use index-friendly predicates for IDS, IVS, SVS, TGHB, MJIH, and KDPV data.
Include current IDS mirror and rotation operators in `ids_similar` lookups while keeping legacy aliases.
