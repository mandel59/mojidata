# react-mojidata-api

React hook for running `mojidata-api` in the browser (Hono `app.fetch` + SQL.js in a WebWorker).

## Install

```sh
yarn add @mandel59/react-mojidata-api
```

## Usage

```tsx
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url"
import { useMojidataApi } from "@mandel59/react-mojidata-api"

function MyComponent() {
  const { ready, client, error } = useMojidataApi({
    createWorker: () =>
      new Worker(new URL("@mandel59/mojidata-api-sqljs/browser-worker", import.meta.url), {
        type: "module",
      }),
    init: {
      sqlWasmUrl: wasmUrl,
      mojidataDbUrl: "/assets/moji.db",
      idsfindDbUrl: "/assets/idsfind.db",
    },
  })

  // Wait for `ready` before calling:
  // await client?.getMojidata("漢", ["UCS"])
  // await client?.idsfind({ ids: ["⿰火土"] })
  return null
}
```

## License

[MIT](./LICENSE.md)
