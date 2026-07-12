# Mojidata IDS DB Bloom vectors

`@mandel59/idsdb-bvec` provides an experimental `idsfind.db` whose candidate
index consists of packed, IDSgrep-inspired 128-bit Bloom vectors.

Each exact decomposition row remains in `idsfind`. The parallel block table
stores four little-endian 32-bit words per row in a BLOB plus block union
summaries. Backends use the vectors only for candidate generation and retain
Mojidata's exact verifier, so Bloom collisions affect performance, not results.

The versioned feature format is not byte-compatible with IDSgrep. The first
implementation uses positive token-presence conditions; stronger structural
compilation can be added without changing the exact-verification boundary.
A decomposition row may contain a forest rather than one complete IDS tree;
additional roots are conservatively folded into the fourth (deep/other) word.
Incomplete prefix trees are also accepted: only nodes actually present in the
stored token stream contribute features.

```sh
corepack yarn workspace @mandel59/idsdb-bvec prepare
```

## License

[MIT](./LICENSE.md)
