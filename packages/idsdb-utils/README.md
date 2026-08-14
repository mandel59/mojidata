# idsdb-utils

Utilities for manipulating IDS (Ideographic Description Sequences) used by mojidata tools.

## Usage (Node)

`IDSDecomposer` uses `sql.js`, so initialization is async:

```ts
import { IDSDecomposer } from "@mandel59/idsdb-utils/node"

const decomposer = await IDSDecomposer.create()
```

## IDSFlow

IDSFlow describes backend-independent IDS corpus construction. Version 1 has
four operations: `read`, `select`, `union`, and optional `decompose`.
`evaluateIdsFlowRecipe` validates and evaluates the operation graph while
concrete readers are supplied by the caller.

An ordinary dataset can be output without recursively replacing its leaves:

```yaml
version: 1
datasets:
  chise:
    read:
      kind: eids
      path: chise.eids
      data_source: chise
output: chise
```

Recursive expansion is explicit and may use a different definition dataset:

```yaml
version: 1
datasets:
  babelstone:
    read: { kind: moji-ids }
  g:
    select: { input: babelstone, irg_source: [G, SG] }
  usource:
    read: { kind: moji-usource }
  roots:
    union: { inputs: [g, usource] }
  expanded:
    decompose:
      input: roots
      using: g
output: expanded
```

`decompose.using` defaults to `decompose.input`. Z-variant expansion and KDPV
radical normalization default to enabled and can be disabled with
`expand_z_variants: false` and `normalize_kdpv_radical_variants: false`.

The canonical default transformation is stored at
`recipes/default.idsflow.yaml`. IDSFlow itself does not resolve Node package
specifiers. A host passes recipe text with an explicit origin; files referenced
by a recipe are resolved relative to that origin.

Future backend-specific materialization recipes should be thin entry recipes
that refer to a shared transformation recipe; they should not duplicate the
conversion graph. Such references will require an explicit, host-supplied URI
catalog and content hash rather than Node or Yarn module resolution. Version 1
does not yet define recipe imports.

## License

[MIT](./LICENSE.md)
