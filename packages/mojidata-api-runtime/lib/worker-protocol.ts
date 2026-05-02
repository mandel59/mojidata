import type { MojidataApiDb } from "@mandel59/mojidata-api-core"

export type WorkerInit = {
  sqlWasmUrl: string
  mojidataDbUrl: string
  idsfindDbUrl: string
  sqliteWasm?: {
    opfsName?: string
    opfsDirectory?: string
    initialCapacity?: number
    clearOnInit?: boolean
    manifestDirectory?: string
    mojidataDbName?: string
    idsfindDbName?: string
    mojidataDbVersion?: string
    idsfindDbVersion?: string
    mojidataDbByteLength?: number
    idsfindDbByteLength?: number
  }
}

export type WorkerCall = {
  [K in keyof MojidataApiDb]: {
    method: K
    args: Parameters<MojidataApiDb[K]>
  }
}[keyof MojidataApiDb]

export type WorkerRequest =
  | { id: number; type: "init"; init: WorkerInit }
  | { id: number; type: "call"; call: WorkerCall }

export type WorkerResponse =
  | { id: number; ok: true; result: any }
  | { id: number; ok: false; error: { message: string; stack?: string } }
