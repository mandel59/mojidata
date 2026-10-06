# CJKVI variant license notice review

Reviewed on 2026-10-06 JST for the CJKVI inputs in
`packages/mojidata/download.txt`.

## Sources and attribution

- All 22 CJKVI files are pinned to
  `e4f1da248c9737a243f9930b5dc497cef5d5ae16` in
  [cjkvi/cjkvi-variants](https://github.com/cjkvi/cjkvi-variants/tree/e4f1da248c9737a243f9930b5dc497cef5d5ae16).
  Every local cached file matched its declared SHA-256 before editing.
- The [official project license declaration](https://kanji-database.sourceforge.net/)
  assigns variant data to the MIT License. Its GPL list covers other datasets,
  none of which is among these 22 inputs. Neither the pinned repository root
  nor its current root contains an independent LICENSE file.
- `cjkvi-simplified.txt`, `cjkvi-variants.txt`, `non-cognates.txt`, and
  `sawndip-variants.txt` contain `Copyright (c) 2014 CJKVI Database`.
  The previous Mojidata summary's `2014-2018` range is replaced with the
  notice actually found in the pinned sources.
- `jp-old-style.txt` credits `organized by: Taichi Kawabata`; the new notice
  preserves that attribution separately from the copyright notice.
- The full terms follow the [standard MIT license text](https://opensource.org/license/mit).
  The notice explicitly identifies itself as assembled from the upstream
  declaration, data headers, and standard terms, rather than an upstream
  LICENSE-file copy.

## Distribution and D1 impact

The package's existing `files` allowlist includes `LICENSE.md` and `licenses/*`,
so no package manifest or build script needs to change. A patch changeset makes
the new notice available through the normal package release process.

The change touches license documentation, the new plain-text notice, the
changeset, and review records only. It does not change `download.txt`, source
data, build scripts, SQL, indexes, API requests, dependencies, imports, or Worker
bindings. The DB input fingerprint does not include these notices or changesets.
Normal npm release validation runs locally/on CI and does not query or import D1.
The incremental account-wide D1 cost is therefore zero rows read and zero rows
written, including retries. No remote D1 operation is part of this work.

## Baseline and validation

Baseline before editing:

```text
packages/mojidata/download.txt SHA-256:
cea3257f6f44368487e4d93f5d2ff0c6a92ddb0d42ac5f71cef9b69bf09a8723
packages/mojidata/dist/moji.db SHA-256:
c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b
python3 packages/mojidata/scripts/db-input-hash.py:
11b2dc56c38f0f364f8da347ffa45230e024040598613a202a2d6c40fce7e08a
```

Validation checks the unchanged baseline hashes, creates a local Yarn package
archive, and compares its license summary and CJKVI notice byte for byte with
the workspace files. The MIT terms are compared with the repository's existing
MIT text; source copyright and additional attribution are checked against all
22 checksum-verified cached inputs. The quota gate validates the current change
using the new fingerprinted review record.

Completed locally:

- All 22 source checksums, copyright notices, and the additional author credit
  passed verification; the complete MIT terms match the repository's MIT text.
- The three baseline hashes above are unchanged.
- `node ../../.yarn/releases/yarn-4.12.0.cjs pack --out /tmp/mojidata-cjkvi-license.tgz --json`
  from `packages/mojidata` succeeded. The archived `package/LICENSE.md` and
  `package/licenses/cjkvi-variants.txt` match the workspace bytes exactly.
- `validateReviews` from `scripts/check-d1-quota-review.mjs` passed on the five
  changed paths reported by `jj diff --name-only`.

Release through the existing npm workflow. Stop if the notice is absent from
the archive, fingerprints differ, or data/runtime paths unexpectedly change.
Recovery is a corrective package release; no database migration or rollback is
needed. Publishing, Worker deployment, and D1 execution are not performed by
this review.
