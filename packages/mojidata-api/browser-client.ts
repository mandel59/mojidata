import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db"
import type {
  WorkerCall,
  WorkerInit,
  WorkerRequest,
  WorkerResponse,
} from "./api/v1/_lib/worker-protocol"

export function createMojidataApiWorkerClient(
  worker: Worker,
  init: WorkerInit,
): MojidataApiDb & { ready: Promise<void>; terminate: () => void } {
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >()

  worker.addEventListener("message", (ev: MessageEvent) => {
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
  })

  const callRaw = <TResult>(req: WorkerRequest): Promise<TResult> => {
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
    idsfind: (idslist) =>
      call<string[]>({ method: "idsfind", args: [idslist] }),
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
