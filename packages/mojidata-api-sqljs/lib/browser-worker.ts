import { createSqlApiDb } from "@mandel59/mojidata-api-core"
import type {
  WorkerInit,
  WorkerRequest,
  WorkerResponse,
} from "@mandel59/mojidata-api-runtime/lib/worker-protocol"

import { createMojidataDbProvider } from "./mojidata-db"
import { createCachedPromise } from "./promise-cache"
import { createSqlJsExecutor } from "./sqljs-executor"
import { openDatabaseFromUrl } from "./sqljs-web"

let api: ReturnType<typeof createSqlApiDb> | undefined

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

async function initWorker(init: WorkerInit) {
  const getMojidataDb = createMojidataDbProvider(() =>
    openDatabaseFromUrl(init.mojidataDbUrl, init.sqlWasmUrl),
  )
  const getIdsfindDb = createCachedPromise(async () =>
    createSqlJsExecutor(await openDatabaseFromUrl(init.idsfindDbUrl, init.sqlWasmUrl)),
  )
  api = createSqlApiDb({ getMojidataDb, getIdsfindDb })
}

self.addEventListener("message", async (ev: MessageEvent) => {
  const req = ev.data as WorkerRequest
  const post = (res: WorkerResponse) => (self as any).postMessage(res)

  try {
    if (req.type === "init") {
      await initWorker(req.init)
      post({ id: req.id, ok: true, result: null })
      return
    }

    if (!api) {
      throw new Error("Worker is not initialized; call init first.")
    }

    const { method, args } = req.call
    const result = await (api as any)[method](...args)
    post({ id: req.id, ok: true, result })
  } catch (error) {
    post({ id: req.id, ok: false, error: serializeError(error) })
  }
})
