# Government-data npm patch releases

Related: #80. Published and verified on 2026-10-06 JST.

## Releases and byte verification

Both packages are published publicly at 1.2.1 with the `latest` tag:

- [@mandel59/joyokanjihyo 1.2.1](https://www.npmjs.com/package/@mandel59/joyokanjihyo/v/1.2.1),
  upstream release commit `35897fa0461cff21a2cef85312ece39f86caa4e0`.
- [@mandel59/nyukanseiji 1.2.1](https://www.npmjs.com/package/@mandel59/nyukanseiji/v/1.2.1),
  upstream release commit `7c185ad57dcebe5a05ee7341acb28147e4a62b88`.

The registry integrity values match the validated npm archives. Downloaded
public archives also match those local archives byte for byte. Each archive
contains exactly the package manifest, corrected README, JSON dataset and
type declaration. JSON and type declarations match published 1.2.0 byte for
byte; only the manifest version and README citation/link changed. The upstream
root package-lock versions are aligned with 1.2.1, with no dependency update.

Published archive SHA-256 values:

- Joyo: `17b98f5116e59382b12cd74f3b93d5b09a4ebf50b129f5d23c5339c64a790345`
- Nyukan: `c92b91fc6909925693a118802b16f7610d5a9fb08cbe506486bb6f59b7ed5282`

## Mojidata integration

Mojidata pins both dependencies to 1.2.1. Yarn lock entries, PnP locations and
the two checked-in cache archives are updated. Unrelated platform cache files
removed by Yarn were restored. No other dependency resolution changed.
The license registry records the new versions/archive checksums and the
government-data notice now identifies the published documentation fixes.
`data-notices.json` was regenerated. Source README snapshots match the new
published packages; their originally pinned correction URLs remain accurate.

All 22 license validator tests and five DB fingerprint tests pass. The local
cache check validates all recorded inputs and npm archive/data hashes; the
local read-only schema check resolves the recorded table/view patterns. A
real Mojidata Yarn archive preserves the current notices and generated data
manifest. The existing DB SHA-256 remains
`c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b`.

## D1 impact

Both imported JSON files and type declarations are byte-identical to the
previous versions, so this dependency update changes no table values, row
counts, SQL, indexes, API fan-out or runtime queries. The actual input hashes
remain recorded in the license registry. Lock/manifest changes invalidate
local DB cache fingerprints and can trigger local rebuilding, but extraction
code and data values are unchanged.

npm publishing, registry verification, Yarn installation with builds skipped,
tests and packing consume zero account-wide D1 reads/writes, including
retries. The npm release workflow does not import into D1 or deploy Workers;
no remote usage sample or operation budget is allocated. Stop on changed
dataset/type hashes, unexpected dependency changes, missing notices or stale
quota evidence. Further remote imports/deployments need a separate review.
