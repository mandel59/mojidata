---
"@mandel59/mojidata-api-core": patch
---

Filter variant relation sources using existing indexes before decoding Unihan values and joining MJ mappings, avoiding full relation scans that exhaust Cloudflare D1 read quotas.
