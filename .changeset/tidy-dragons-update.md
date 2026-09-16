---
"@mandel59/mojidata": minor
---

Apply the Unicode 18.0 IDS delta after the Unicode 17.0 IDS patch when building the character database.

Use the finalized `ids/unicode-18.0.txt` path from mojidata-ids, pinned to its release-preparation commit.

Refresh Standardized Variants, U-Source, and Unihan from the final Unicode 18.0.0 release, including the corrected UK-01469 mapping and updated Unihan readings and variants. Pin the release data checksums and remove superseded source caches.
