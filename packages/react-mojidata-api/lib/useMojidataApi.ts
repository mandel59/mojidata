import { useEffect, useMemo, useRef, useState } from "react"

import { createApp } from "@mandel59/mojidata-api/hono"
import type { MojidataApiDb } from "@mandel59/mojidata-api/api/v1/_lib/mojidata-api-db"
import type {
  WorkerCall,
  WorkerInit,
  WorkerRequest,
  WorkerResponse,
} from "@mandel59/mojidata-api/api/v1/_lib/worker-protocol"

export type MojidataApiMojidataResponse = {
  query: { char: string; select?: string[] }
  results: unknown
}

export type MojidataApiIdsfindQuery = {
  ids?: string[]
  whole?: string[]
  p?: string[]
  q?: string[]
  limit?: number
  offset?: number
  all_results?: boolean
}

export type MojidataApiIdsfindResponse = {
  query: MojidataApiIdsfindQuery
  results: string[]
  total?: number
  done?: boolean
}

export type MojidataApiClient = {
  ready: Promise<void>
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  getMojidata: (char: string, select?: string[]) => Promise<MojidataApiMojidataResponse>
  idsfind: (query: MojidataApiIdsfindQuery) => Promise<MojidataApiIdsfindResponse>
  terminate: () => void
}

export type MojidataApiHookOptions = {
  init: WorkerInit
  worker?: Worker
  createWorker?: () => Worker
  terminateWorker?: boolean
  baseUrl?: string
  createDb?: (
    worker: Worker,
    init: WorkerInit,
  ) => MojidataApiDb & {
    ready: Promise<void>
    terminate: () => void
    dispose?: () => void
  }
}

type HookState = {
  ready: boolean
  error?: Error
  client?: MojidataApiClient
}

function appendMany(params: URLSearchParams, key: string, values?: string[]) {
  if (!values) return
  for (const value of values) params.append(key, value)
}

async function parseJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => undefined)
  if (res.ok) return body
  const message =
    body && typeof body === "object" && body.error && typeof body.error.message === "string"
      ? body.error.message
      : `Request failed: ${res.status}`
  throw new Error(message)
}

function createWorkerDb(
  worker: Worker,
  init: WorkerInit,
): MojidataApiDb & { ready: Promise<void>; terminate: () => void; dispose: () => void } {
  let nextId = 1
  let terminalError: Error | undefined
  const pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >()

  const rejectAll = (error: Error) => {
    for (const { reject } of pending.values()) reject(error)
    pending.clear()
  }

  const onMessage = (ev: MessageEvent) => {
    const msg = ev.data as WorkerResponse
    const handler = pending.get(msg.id)
    if (!handler) return
    pending.delete(msg.id)
    if (msg.ok) {
      handler.resolve(msg.result)
      return
    }
    const err = new Error(msg.error.message)
    if (msg.error.stack) err.stack = msg.error.stack
    handler.reject(err)
  }

  const onError = (ev: Event) => {
    const err =
      ev && typeof ev === "object" && "message" in ev && typeof (ev as any).message === "string"
        ? new Error((ev as any).message)
        : new Error("Worker error")
    terminalError = err
    rejectAll(err)
  }

  const onMessageError = () => {
    const err = new Error("Worker messageerror")
    terminalError = err
    rejectAll(err)
  }

  worker.addEventListener("message", onMessage)
  worker.addEventListener("error", onError as any)
  worker.addEventListener("messageerror", onMessageError as any)

  const callRaw = <TResult>(req: WorkerRequest): Promise<TResult> => {
    if (terminalError) return Promise.reject(terminalError)
    const id = req.id
    return new Promise<TResult>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage(req)
    })
  }

  const initId = nextId++
  const ready = callRaw<void>({ id: initId, type: "init", init })

  const call = async <TResult>(call: WorkerCall): Promise<TResult> => {
    await ready
    const id = nextId++
    return await callRaw<TResult>({ id, type: "call", call })
  }

  return {
    ready,
    dispose: () => {
      worker.removeEventListener("message", onMessage)
      worker.removeEventListener("error", onError as any)
      worker.removeEventListener("messageerror", onMessageError as any)
    },
    terminate: () => worker.terminate(),
    getMojidataJson: (char, select) =>
      call<string | null>({ method: "getMojidataJson", args: [char, select] }),
    getIvsList: (char) =>
      call<
        Array<{
          IVS: string
          unicode: string
          collection: string
          code: string
        }>
      >({ method: "getIvsList", args: [char] }),
    getMojidataVariantRels: (chars) =>
      call<Array<{ c1: string; c2: string; f: number; r: string }>>({
        method: "getMojidataVariantRels",
        args: [chars],
      }),
    idsfind: (idslist) => call<string[]>({ method: "idsfind", args: [idslist] }),
    idsfindDebugQuery: (queryBody, idslist) =>
      call<Record<string, unknown>[]>({
        method: "idsfindDebugQuery",
        args: [queryBody, idslist],
      }),
    search: (ps, qs) => call<string[]>({ method: "search", args: [ps, qs] }),
    filterChars: (chars, ps, qs) =>
      call<string[]>({ method: "filterChars", args: [chars, ps, qs] }),
  }
}

export function useMojidataApi(options: MojidataApiHookOptions) {
  const {
    init,
    worker: providedWorker,
    createWorker,
    terminateWorker = !providedWorker,
    baseUrl = "http://local",
    createDb = createWorkerDb,
  } = options

  const [state, setState] = useState<HookState>({ ready: false })
  const latestDispose = useRef<(() => void) | undefined>(undefined)
  const createWorkerRef = useRef(createWorker)
  const createDbRef = useRef(createDb)
  createWorkerRef.current = createWorker
  createDbRef.current = createDb

  const initKey = useMemo(() => {
    return JSON.stringify(init)
  }, [init])

  useEffect(() => {
    const worker = providedWorker ?? createWorkerRef.current?.()
    if (!worker) {
      setState({ ready: false, error: new Error("worker is required") })
      return
    }

    const db = createDbRef.current(worker, init)
    const app = createApp(db)

    const fetchViaApp: MojidataApiClient["fetch"] = async (input, reqInit) => {
      const req =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), baseUrl), reqInit)
      return await app.fetch(req)
    }

    const client: MojidataApiClient = {
      ready: db.ready,
      terminate: () => db.terminate(),
      fetch: fetchViaApp,
      getMojidata: async (char, select) => {
        const params = new URLSearchParams()
        params.set("char", char)
        appendMany(params, "select", select)
        const res = await fetchViaApp(`/api/v1/mojidata?${params.toString()}`)
        return (await parseJsonOrThrow(res)) as MojidataApiMojidataResponse
      },
      idsfind: async (query) => {
        const params = new URLSearchParams()
        appendMany(params, "ids", query.ids)
        appendMany(params, "whole", query.whole)
        appendMany(params, "p", query.p)
        appendMany(params, "q", query.q)
        if (typeof query.limit === "number") params.set("limit", String(query.limit))
        if (typeof query.offset === "number") params.set("offset", String(query.offset))
        if (query.all_results) params.set("all_results", "1")
        const res = await fetchViaApp(`/api/v1/idsfind?${params.toString()}`)
        return (await parseJsonOrThrow(res)) as MojidataApiIdsfindResponse
      },
    }

    let alive = true
    latestDispose.current?.()
    latestDispose.current = db.dispose
    setState({ ready: false, client })

    db.ready
      .then(() => {
        if (!alive) return
        setState((s) => ({ ...s, ready: true, error: undefined }))
      })
      .catch((error) => {
        if (!alive) return
        setState((s) => ({ ...s, ready: false, error: error as Error }))
      })

    return () => {
      alive = false
      try {
        db.dispose?.()
      } finally {
        if (terminateWorker) db.terminate()
      }
    }
  }, [baseUrl, initKey, providedWorker, terminateWorker])

  return state
}
