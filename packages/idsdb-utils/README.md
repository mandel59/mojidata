# idsdb-utils

Utilities for manipulating IDS (Ideographic Description Sequences) used by mojidata tools.

## Usage (Node)

`IDSDecomposer` uses `sql.js`, so initialization is async:

```ts
import { IDSDecomposer } from "@mandel59/idsdb-utils/node"

const decomposer = await IDSDecomposer.create()
```

## License

[MIT](./LICENSE.md)
