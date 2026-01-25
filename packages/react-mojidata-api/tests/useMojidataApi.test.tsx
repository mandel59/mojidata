import { test } from "node:test"
import assert from "node:assert/strict"

import React, { useEffect, useState } from "react"
import { render, waitFor } from "@testing-library/react"
import { JSDOM } from "jsdom"

import { useMojidataApi } from "../index"

function setupDom() {
  const dom = new JSDOM(`<!doctype html><html><body></body></html>`, {
    url: "http://localhost/",
  })
  ;(globalThis as any).window = dom.window
  ;(globalThis as any).document = dom.window.document
  ;(globalThis as any).navigator = dom.window.navigator
}

test("useMojidataApi exposes client and gets data via app.fetch", async () => {
  setupDom()

  const fakeDb = {
    ready: Promise.resolve(),
    terminate: () => {},
    getMojidataJson: async (char: string, select: string[]) => {
      return JSON.stringify({ ok: true, char, select })
    },
    idsfind: async (idslist: string[]) => idslist,
    search: async () => [],
    filterChars: async (chars: string[]) => chars,
  }

  const createDb = () => fakeDb as any
  const createWorker = () => ({ terminate: () => {} }) as any

  function App() {
    const { ready, client, error } = useMojidataApi({
      createWorker,
      createDb,
      init: { sqlWasmUrl: "x", mojidataDbUrl: "y", idsfindDbUrl: "z" },
    })
    const [text, setText] = useState<string>("")

    useEffect(() => {
      if (!ready || !client) return
      client
        .getMojidata("漢", ["UCS"])
        .then((r) => setText(JSON.stringify(r.results)))
    }, [client, ready])

    if (error) return <div>Error</div>
    return <div>{text || "Loading"}</div>
  }

  const rendered = render(<App />)
  await waitFor(() => {
    assert.match(
      rendered.container.textContent ?? "",
      /\{.*"ok":true.*"char":"漢".*"select":\["UCS"\].*\}/,
    )
  })
})

test("useMojidataApi calls terminate on unmount", async () => {
  setupDom()

  let terminated = 0
  const createDb = () =>
    ({
      ready: Promise.resolve(),
      terminate: () => {
        terminated++
      },
      getMojidataJson: async () => null,
      idsfind: async () => [],
      search: async () => [],
      filterChars: async () => [],
    }) as any
  const createWorker = () => ({ terminate: () => {} }) as any

  function App() {
    useMojidataApi({
      createWorker,
      createDb,
      init: { sqlWasmUrl: "x", mojidataDbUrl: "y", idsfindDbUrl: "z" },
    })
    return <div />
  }

  const { unmount } = render(<App />)
  await waitFor(() => assert.equal(terminated, 0))
  unmount()
  assert.equal(terminated, 1)
})
