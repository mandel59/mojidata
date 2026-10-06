# Data notice and provenance review

Reviewed on 2026-10-06 JST for issue #80.

## Source-specific decisions

- The READMEs at both pinned Mojidata IDS revisions
  (`d282fc42965b363d37cef23c71d442fcaa29243d` and
  `fa6eb609233e09386629b1f44b7b3f5c7fec5b5e`) identify `ids/` data as CC0.
  MIT-0 applies to their scripts. The identical README text is preserved in
  `packages/mojidata/licenses/sources/mojidata-ids-README.md`.
- The pinned Doon and TGHB READMEs describe Wikisource transcription and CC0
  dedications for rights arising from the prepared data. Notices retain both
  the original-source public-domain statements and the processing dedication,
  rather than treating a script license as a data license. The READMEs are
  preserved; TGHB has not been independently checked against the government PDF.
- The MJ list page and pinned MJ shrink-map archive identify CC BY-SA 2.1 JP
  and require IPA attribution. The notice covers the three imported versions,
  describes the extraction/normalization, links the legal terms, and preserves
  the shrink-map archive's original Readme.txt.
- BabelStone's documentation item 2 is copied from the checksum-verified pinned
  `IDS.TXT`. It permits use without permission/attribution and waives rights in
  the presentation format. It is recorded as its own statement, not labeled CC0.
- The npm 1.2.0 READMEs for Joyo and Nyukan describe government-notice data and
  MIT-0 extraction programs. A separate notice uses the correct Article 13,
  item 2 reference. Original READMEs are preserved without editing upstream
  packages or this repository's Yarn cache.
- Full CC0 1.0 legal text is copied from
  <https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt>.

## Local validation and D1 impact

All 38 downloaded inputs matched their existing SHA-256 checksums. The ordered
noncomment rows in `download.txt` are identical before and after; only license
comments changed. The manifest is itself hashed by the existing DB cache logic,
so this comment correction invalidates that local cache key, but does not alter
any source bytes, extraction logic, generated table contents, SQL, indexes, API
fan-out, imports, or deployed bindings. No DB rebuild was needed for validation.

The local DB SHA-256 remains:

```text
c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b
```

The package's license expression adds CC0-1.0 and its file allowlist includes
`licenses/**`, preserving nested source declarations. Manifest license/files
fields are excluded by the existing build-input normalization. A patch
changeset records the distributed-notice changes.

Packing with Yarn to `/tmp/mojidata-data-notices.tgz` verifies the actual archive
contains every notice and source snapshot with exactly the workspace bytes.
Review fingerprints cover the package changes and are validated by the quota
gate. These local and normal GitHub/npm release operations use zero D1 reads
and writes, including retries. Worker deployment and database import are outside
this operation; this review does not authorize either one.

Stop on missing archive notices, input differences, stale review hashes, or
unexpected data/runtime changes. Recover notice errors with a corrective npm
release; no database migration or remote rollback is required.
