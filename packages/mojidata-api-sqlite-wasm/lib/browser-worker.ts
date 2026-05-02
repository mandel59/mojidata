import type { MojidataApiDb } from "@mandel59/mojidata-api-core"
import type {
  WorkerRequest,
  WorkerResponse,
} from "@mandel59/mojidata-api-runtime/lib/worker-protocol"
import type { WorkerInit } from "@mandel59/mojidata-api-runtime/lib/worker-protocol"

import {
  createSqliteWasmDbFromOpfsSAHPool,
  getSqliteWasm,
  installOpfsSAHPool,
} from "../index.js"

let api: MojidataApiDb | undefined

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

async function initWorker(init: WorkerInit) {
  const wasmUrl = init.sqliteWasm?.wasmUrl ?? init.sqlWasmUrl
  const sqlite3 = await getSqliteWasm({
    wasmUrl: wasmUrl || undefined,
    wasmBinary: init.sqliteWasm?.wasmBinary,
  })
  const poolUtil = await installOpfsSAHPool(sqlite3, {
    name: init.sqliteWasm?.opfsName,
    directory: init.sqliteWasm?.opfsDirectory,
    initialCapacity: init.sqliteWasm?.initialCapacity ?? 6,
    clearOnInit: init.sqliteWasm?.clearOnInit,
  })
  const manifestDirectory = init.sqliteWasm?.manifestDirectory
  api = await createSqliteWasmDbFromOpfsSAHPool({
    poolUtil,
    mojidata: {
      name: init.sqliteWasm?.mojidataDbName ?? "/mojidata/moji.db",
      assetUrl: init.mojidataDbUrl,
      assetVersion: init.sqliteWasm?.mojidataDbVersion ?? init.mojidataDbUrl,
      byteLength: init.sqliteWasm?.mojidataDbByteLength,
      manifestDirectory,
    },
    idsfind: {
      name: init.sqliteWasm?.idsfindDbName ?? "/mojidata/idsfind.db",
      assetUrl: init.idsfindDbUrl,
      assetVersion: init.sqliteWasm?.idsfindDbVersion ?? init.idsfindDbUrl,
      byteLength: init.sqliteWasm?.idsfindDbByteLength,
      manifestDirectory,
    },
  })
}

globalThis.addEventListener("message", async (ev: MessageEvent) => {
  const req = ev.data as WorkerRequest
  const post = (res: WorkerResponse) => (globalThis as unknown as Worker).postMessage(res)

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
