# mojidata-idsfind

Experimental native execution harness for the Mojidata IDS search study. It
opens an existing FTS5 IDS database read-only, generates candidates with the
same positional-phrase condition as the raw EIDS query path, and applies an
exact structural verifier before emitting the complete result set.

This is not a general Mojidata CLI. It intentionally accepts only schema 3
`registered` databases with the `idsflow-records@1` profile and one query from
the IDSgrep-compatible fragment:

- literal nodes and complete binary or ternary IDS trees;
- zero or one one-node wildcard `？`;
- optional paired root anchors `§`;
- one query group, one alternative, and multiplicity one.

Variables, component resolution, overlay expansion, positional operators,
multiple groups or alternatives, legacy/experimental semantics, FTS4, and
BV128 are rejected rather than approximated.

## Build and check

```console
cargo fmt --manifest-path tools/mojidata-idsfind-rs/Cargo.toml -- --check
cargo test --manifest-path tools/mojidata-idsfind-rs/Cargo.toml
cargo clippy --manifest-path tools/mojidata-idsfind-rs/Cargo.toml --all-targets -- -D warnings
cargo build --release --manifest-path tools/mojidata-idsfind-rs/Cargo.toml
```

The committed lockfile and `rusqlite` bundled feature pin the Rust dependency
graph and compile SQLite into the executable. Record the executable hash,
SQLite compile options, compiler version, release flags, database hash, and
source commit before a performance run.

## Run

```console
tools/mojidata-idsfind-rs/target/release/mojidata-idsfind \
  --db /path/to/idsfind.db \
  --query-json '["⿰火土"]'
```

The default candidate source is `fts5`. `--candidate-source all` is a
correctness-only all-root oracle mode and must not be used as a performance
peer. `--output-kind candidates` emits the sorted unique candidate roots before
exact verification. It exists only for candidate-set differential diagnostics
and must not be timed as a search target:

```console
tools/mojidata-idsfind-rs/target/release/mojidata-idsfind \
  --db /path/to/idsfind.db \
  --query-json '["⿰火土"]' \
  --output-kind candidates
```

`--output-kind diagnostics` runs the same filter-and-verify path but emits
counts and phase durations for SQLite open, manifest validation, candidate
generation, decomposition prefetch, exact verification, and serialization of
the complete result array. Measure process wall time outside the executable;
the difference includes process startup, argument/query compilation,
diagnostic serialization, and exit. This mode is excluded from principal
timing, so the default result path performs no phase timing.

Successful output is a sorted unique JSON string array on stdout; diagnostics
use a JSON object on stdout, errors use stderr, and invalid input exits nonzero.
