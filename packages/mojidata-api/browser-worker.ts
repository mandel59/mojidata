import { createSqlApiDb } from "./api/v1/_lib/mojidata-api-db-sql"
import { createMojidataDbProvider } from "./api/v1/_lib/mojidata-db"
import { createCachedPromise } from "./api/v1/_lib/promise-cache"
import { openDatabaseFromUrl } from "./api/v1/_lib/sqljs-web"
import { createSqlJsExecutor } from "./api/v1/_lib/sqljs-executor"
import type {
  WorkerInit,
  WorkerRequest,
  WorkerResponse,
} from "./api/v1/_lib/worker-protocol"

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
    createSqlJsExecutor(
      await openDatabaseFromUrl(init.idsfindDbUrl, init.sqlWasmUrl),
    ),
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
