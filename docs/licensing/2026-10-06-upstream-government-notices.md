# Upstream government-notice documentation refresh

Related: #80. Reviewed on 2026-10-06 JST.

## Pinned declarations and data versions

The bundled declarations now reproduce the corrected upstream READMEs exactly:

| Resource | README revision | README SHA-256 |
| --- | --- | --- |
| Joyo | `e6bbe8a0ea2648f9c4001b43f4b0fdafc6b7ec37` | `cea5094f94c7098a73283a9e693d87cd12bceb3a4c080618a0eeccfe37f631ae` |
| Nyukan | `3ecf5860ea0755dae5933361f5ca9c6930523956` | `1befc3105d338e33b9e8063a578c79f085b8366b60bcaab7fa750294ef2223aa` |

Both documentation fixes replace the Article 13-2 typo with Article 13,
item 2 and update the e-Gov link. As checked against npm's latest metadata,
both data packages remain published at 1.2.0. Their dependency versions and
Yarn checksums are unchanged. The README revision URLs are recorded in
`licenses/japanese-government-data.txt` and the custom license definition's
source links; the input records continue to identify the npm datasets.

The upstream JSON files at these revisions match the cached npm 1.2.0 data
byte for byte:

- `joyokanjihyo.json`:
  `1b66081e04bf010faf08e9ec2e360f5d6b4abbcb3415423ba629ccd542fab7b8`
- `nyukanseiji.json`:
  `1c9c83dca4aacea98985612904ef68004bf1f1df8e4a2dd2df2052229e8037aa`

This supersedes the old README snapshots described in the preceding notice
review; that historical review remains a record of the earlier source state.

## Validation and D1 boundary

The new snapshots match the pinned checkouts byte for byte. The three notice
hashes and custom definition's extracted text were refreshed, and
`data-notices.json` was regenerated. All 22 validator tests pass, as do the
cached-input hashes and local read-only schema check. A real Yarn archive
preserves the updated source declarations, notice and generated manifest.
The three IDS distribution manifests are unchanged because they do not select
Joyo or Nyukan inputs.

The existing `moji.db` SHA-256 remains
`c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b`.
There is no change to input data, package dependencies, build input files,
SQL, indexes, runtime queries, API fan-out or import/deployment operations.
Only documentation, source declarations and generated notice metadata change.
Incremental D1 reads/writes are zero account-wide, including local pack retries.
No remote quota is sampled or allocated.

Release as a metadata-only patch. Stop on mismatched README/data hashes,
stale generated notices, missing archive notices or changed DB bytes. Correct
notification errors with another patch; this review authorizes no remote DB
operation or Worker deployment.
