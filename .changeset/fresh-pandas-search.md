---
"@mandel59/idsdb": minor
"@mandel59/idsdb-utils": minor
---

Add an experimental EIDS data-source adapter for IDSDB builds. IDSgrep EIDS
dictionaries can now be converted into ordinary IDS search data in an isolated
output directory without modifying `moji.db`. Build metadata records the
selected IDS data sources, EIDS conversion counts, input path, and SHA-256
digest. IDSDecomposer also accepts adapter-provided IDS rows and expands named
entity definitions when present.
