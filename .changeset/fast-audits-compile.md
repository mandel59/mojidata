---
"@mandel59/mojidata-api-core": patch
---

Compile IDS exact-match audit patterns before scanning candidates and avoid
asynchronous work inside the matcher hot loop.
