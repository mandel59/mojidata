# License review fixes

Related: #80. Reviewed on 2026-10-06 JST.

## npm import coverage

The license validator previously matched only `from "@mandel59/..."` with a
single space. A valid single-quoted or multiline import could introduce a new
npm dataset without registering its provenance and notice. The check now
accepts both quote styles and whitespace, including tabs and newlines, with
matching opening and closing quotes.

Two regression tests exercise eight combinations each: registered imports
must pass, while adding an unregistered dataset alongside the registered
import must fail. This remains a textual check of scoped `from` specifiers,
not a complete TypeScript parser or a check of dynamic data-loading paths.

## MJ license and disclaimer notice

The [official MJ list distribution page](https://moji.or.jp/mojikiban/mjlist/)
was retrieved on 2026-10-06. Its license paragraph, including the Character
Information Technology Promotion Council's disclaimer, is preserved in
`packages/mojidata/licenses/mj.txt`. The paragraph's text is unchanged after
removing HTML markup; the original license link is recorded separately.
The existing copyright attribution, license URLs and transformation notice
remain alongside it. The registry's MJ notice hash and generated distribution
manifest are updated, and a patch changeset records the packaging change.

This saves the current notice for the same source versions already imported;
it does not establish the contents of the page at an earlier acquisition date.

## Validation and D1 impact

All 24 license validator tests pass, including the 16 import regression cases.
The full local input-hash and read-only database schema checks pass for the
14 resources and four distributions. A real Mojidata Yarn archive passes the
notice validator and contains the original MJ paragraph and updated manifest.

The existing DB SHA-256 remains
`c8cd43031d6a48bde6b131f0fd0fb778301627846c4b65ff038937884c21ea6b`.
No data inputs, generators, SQL, indexes, API queries, D1 operations or runtime
dependencies change. The checker reads local files and schema metadata only;
tests use temporary local fixtures. Packing changes documentation bytes only.
Incremental account-wide D1 reads and writes are therefore both zero, including
retries, and existing traffic reserves are untouched. No remote D1 operation
or deployment occurs. Stop if source text, notice hashes or archive checks
disagree; revert these notice/checker edits without a DB rollback if necessary.
