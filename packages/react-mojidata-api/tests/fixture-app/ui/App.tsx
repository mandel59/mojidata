import React, { useEffect, useState } from "react"

import { useMojidataApi } from "@mandel59/react-mojidata-api"

export function App() {
  const [done, setDone] = useState(false)
  const [mojidataOk, setMojidataOk] = useState(false)
  const [idsfindHasSample, setIdsfindHasSample] = useState(false)
  const [log, setLog] = useState<string>("")

  const { ready, client, error } = useMojidataApi({
    createWorker: () => {
      const w = new Worker(
        new URL("@mandel59/mojidata-api-runtime/browser-worker", import.meta.url),
        {
          type: "module",
        },
      )
      return w
    },
    init: {
      sqlWasmUrl: "/assets/sql-wasm.wasm",
      mojidataDbUrl: "/assets/moji.db",
      idsfindDbUrl: "/assets/idsfind.db",
    },
  })

  useEffect(() => {
    if (!ready || !client) return
    let alive = true
    ;(async () => {
      const mojidata = await client.getMojidata("江", ["UCS"])
      const idsfind = await client.idsfind({ ids: ["⿰火土"] })

      if (!alive) return
      setMojidataOk(Boolean(mojidata?.results))
      setIdsfindHasSample(idsfind.results.includes("灶"))
      setLog(
        JSON.stringify(
          {
            mojidata: mojidata.results,
            idsfindFirst: idsfind.results.slice(0, 10),
          },
          null,
          2,
        ),
      )
      setDone(true)
    })().catch((e) => {
      if (!alive) return
      setLog(String(e))
    })
    return () => {
      alive = false
    }
  }, [client, ready])

  return (
    <div>
      <div data-testid="ready">{String(ready)}</div>
      <div data-testid="error">{error?.message ?? ""}</div>
      <div data-testid="done">{String(done)}</div>
      <div data-testid="mojidataOk">{String(mojidataOk)}</div>
      <div data-testid="idsfindHasSample">{String(idsfindHasSample)}</div>
      <pre data-testid="log">{log}</pre>
    </div>
  )
}
