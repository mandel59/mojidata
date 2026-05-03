---
"@mandel59/mojidata-api-hono": patch
"@mandel59/mojidata-api": patch
---

Add `Cache-Control: no-store` to mojidata-api JSON responses so D1 blue/green
cutovers are not hidden by stale consumer-side caches.
