# react-mojidata-api

React hook for running `@mandel59/mojidata-api` in the browser (Hono `app.fetch` + SQL.js in a WebWorker).

## Install

```sh
yarn add @mandel59/react-mojidata-api
```

## Usage

```ts
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url"
import { useMojidataApi } from "@mandel59/react-mojidata-api"

const worker = new Worker(
  new URL("@mandel59/mojidata-api/browser-worker", import.meta.url),
  { type: "module" },
)

function MyComponent() {
  const { ready, client, error } = useMojidataApi({
    worker,
    init: {
      sqlWasmUrl: wasmUrl,
      mojidataDbUrl: "/assets/moji.db",
      idsfindDbUrl: "/assets/idsfind.db",
    },
  })

  // client.getMojidata(...), client.idsfind(...)
  return null
}
```

## License

[MIT](./LICENSE.md)
