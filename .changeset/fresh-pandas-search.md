---
"@mandel59/idsdb": minor
"@mandel59/idsdb-utils": minor
---

Add an experimental IDSFlow path for external IDS data without modifying
`moji.db`. A separate, currently private adapter converts IDSgrep EIDS
dictionaries into a versioned neutral JSONL format; MIT IDSDB packages consume
only that file and do not depend on the adapter. Build metadata records the
selected IDS data sources, upstream conversion counts, input path, and SHA-256
digest. IDSDecomposer also accepts adapter-provided IDS rows and expands named
entity definitions when present.
