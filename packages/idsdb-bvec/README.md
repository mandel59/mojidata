# Mojidata IDS DB Bloom vectors

`@mandel59/idsdb-bvec` provides an experimental `idsfind.db` whose candidate
index consists of packed, IDSgrep-inspired 128-bit Bloom vectors.

Each exact decomposition row remains in `idsfind`. The parallel block table
stores four little-endian 32-bit words per row in a BLOB plus block union
summaries. Backends use the vectors only for candidate generation and retain
Mojidata's exact verifier, so Bloom collisions affect performance, not results.

The versioned feature format is not byte-compatible with IDSgrep. Query
patterns that form one prefix root are compiled into alternatives over the
four positional words. Fragments that can cross root or sibling boundaries
fall back to positive token-presence conditions, preserving the
exact-verification boundary without introducing false negatives.
A decomposition row may contain a forest rather than one complete IDS tree;
additional roots are conservatively folded into the fourth (deep/other) word.
Incomplete prefix trees are also accepted: only nodes actually present in the
stored token stream contribute features.

## Reference

The Bloom-style candidate-filtering design is based on Matthew Skala's
IDSgrep paper:

- Matthew Skala, [“A Structural Query System for Han Characters”](https://arxiv.org/abs/1404.5585),
  *International Journal of Asian Language Processing* 25(2), 127–159, 2015.

Mojidata reuses the paper's central idea—conservative bit-vector filtering
followed by exact tree matching—but defines a different feature encoding and
stores vectors and block summaries in SQLite.

```sh
corepack yarn workspace @mandel59/idsdb-bvec prepare
```

## License

[MIT](./LICENSE.md)
