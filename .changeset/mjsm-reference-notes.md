---
"@mandel59/mojidata-api-core": minor
"@mandel59/mojidata-api": patch
---

Include MJ shrink-map reference information as `mjsm_note` on each `mji` record,
including notes for glyphs without a shrink target. Return `null` when absent.
