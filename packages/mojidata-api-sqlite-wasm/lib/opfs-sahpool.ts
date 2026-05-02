import sqlite3InitModule, {
  type Database,
  type SAHPoolUtil,
  type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm"

export const DEFAULT_OPFS_MANIFEST_DIRECTORY = "mojidata-api-sqlite-wasm"

export type SqliteWasmSAHPoolUtil = Omit<SAHPoolUtil, "OpfsSAHPoolDb"> & {
  OpfsSAHPoolDb: new (filename: string, flags?: string) => Database
}

export type OpfsSAHPoolInstallOptions = Parameters<
  Sqlite3Static["installOpfsSAHPoolVfs"]
>[0] & {
  forceReinitIfPreviouslyFailed?: boolean
}

export type OpfsSAHPoolMaterializeOptions = {
  name: string
  assetUrl: string
  assetVersion: string
  byteLength?: number
  manifestKey?: string
  manifestDirectory?: string
  fetch?: (input: string) => Promise<Response>
}

export type OpfsSAHPoolManifest = {
  name: string
  assetUrl: string
  assetVersion: string
  byteLength: number
  importedAt: string
}

export type EnsureOpfsSAHPoolDatabaseResult = {
  name: string
  manifest: OpfsSAHPoolManifest
  status: "imported" | "reused"
}

export type SqliteWasmOpfsFailureReason =
  | "unsupported"
  | "pool-init-failed"
  | "manifest-read-failed"
  | "fetch-failed"
  | "byte-length-mismatch"
  | "import-failed"
  | "manifest-write-failed"

export type SqliteWasmOpfsFailure = {
  ok: false
  reason: SqliteWasmOpfsFailureReason
  error: Error
}

export class SqliteWasmOpfsError extends Error {
  constructor(
    readonly reason: SqliteWasmOpfsFailureReason,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = "SqliteWasmOpfsError"
  }
}

let sqlite3Promise: Promise<Sqlite3Static> | undefined

export function getSqliteWasm(): Promise<Sqlite3Static> {
  sqlite3Promise ??= sqlite3InitModule()
  return sqlite3Promise
}

function getNavigatorStorage(): { getDirectory?: () => Promise<FileSystemDirectoryHandle> } | undefined {
  return (globalThis.navigator as { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } } | undefined)
    ?.storage
}

function isWorkerLikeScope() {
  const workerCtor = (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope
  return typeof workerCtor === "function" && globalThis instanceof workerCtor
}

export function isOpfsSAHPoolSupported() {
  return isWorkerLikeScope() && typeof getNavigatorStorage()?.getDirectory === "function"
}

export async function installOpfsSAHPool(
  sqlite3: Sqlite3Static,
  options: OpfsSAHPoolInstallOptions = {},
): Promise<SqliteWasmSAHPoolUtil> {
  if (!isOpfsSAHPoolSupported()) {
    throw new SqliteWasmOpfsError(
      "unsupported",
      "SQLite wasm opfs-sahpool requires OPFS APIs in a Worker context.",
    )
  }
  try {
    return (await sqlite3.installOpfsSAHPoolVfs(options)) as SqliteWasmSAHPoolUtil
  } catch (error) {
    throw new SqliteWasmOpfsError(
      "pool-init-failed",
      "Failed to initialize SQLite wasm opfs-sahpool.",
      error,
    )
  }
}

export async function tryInstallOpfsSAHPool(
  sqlite3: Sqlite3Static,
  options: OpfsSAHPoolInstallOptions = {},
): Promise<{ ok: true; poolUtil: SqliteWasmSAHPoolUtil } | SqliteWasmOpfsFailure> {
  try {
    return { ok: true, poolUtil: await installOpfsSAHPool(sqlite3, options) }
  } catch (error) {
    return toFailure(error)
  }
}

function normalizeOpfsName(name: string) {
  if (!name.startsWith("/")) {
    throw new Error(`opfs-sahpool database names must be absolute paths: ${name}`)
  }
  return name
}

function getManifestSegments(options: OpfsSAHPoolMaterializeOptions) {
  const key = options.manifestKey ?? options.name
  const normalized = key.replace(/^\/+/u, "").replace(/\/+$/u, "")
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length === 0) {
    return ["root.json"]
  }
  const leaf = segments[segments.length - 1]
  return [...segments.slice(0, -1), `${leaf}.json`]
}

async function getManifestFileHandle(
  options: OpfsSAHPoolMaterializeOptions,
  create: boolean,
) {
  const storage = getNavigatorStorage()
  if (typeof storage?.getDirectory !== "function") {
    throw new Error("navigator.storage.getDirectory() is not available.")
  }
  const root = await storage.getDirectory()
  const baseDirectory = options.manifestDirectory ?? DEFAULT_OPFS_MANIFEST_DIRECTORY
  const path = [baseDirectory, ...getManifestSegments(options)].filter(Boolean)
  const fileName = path[path.length - 1]
  let dir = root
  for (const segment of path.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(segment, { create })
  }
  return await dir.getFileHandle(fileName, { create })
}

export async function readOpfsSAHPoolManifest(
  options: OpfsSAHPoolMaterializeOptions,
): Promise<OpfsSAHPoolManifest | null> {
  try {
    const handle = await getManifestFileHandle(options, false)
    const file = await handle.getFile()
    return JSON.parse(await file.text()) as OpfsSAHPoolManifest
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return null
    }
    throw error
  }
}

export async function writeOpfsSAHPoolManifest(
  options: OpfsSAHPoolMaterializeOptions,
  manifest: OpfsSAHPoolManifest,
) {
  const handle = await getManifestFileHandle(options, true)
  const writable = await handle.createWritable()
  try {
    await writable.write(JSON.stringify(manifest, null, 2))
  } finally {
    await writable.close()
  }
}

function isManifestCurrent(
  poolUtil: SqliteWasmSAHPoolUtil,
  options: OpfsSAHPoolMaterializeOptions,
  manifest: OpfsSAHPoolManifest | null,
) {
  return Boolean(
    manifest &&
      manifest.name === options.name &&
      manifest.assetUrl === options.assetUrl &&
      manifest.assetVersion === options.assetVersion &&
      (options.byteLength === undefined || manifest.byteLength === options.byteLength) &&
      poolUtil.getFileNames().includes(options.name),
  )
}

async function fetchDatabaseBytes(options: OpfsSAHPoolMaterializeOptions) {
  const fetcher = options.fetch ?? globalThis.fetch
  if (typeof fetcher !== "function") {
    throw new Error("fetch() is not available.")
  }
  const response = await fetcher(options.assetUrl)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch SQLite database asset: ${options.assetUrl} (${response.status} ${response.statusText})`,
    )
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (options.byteLength !== undefined && bytes.byteLength !== options.byteLength) {
    throw new SqliteWasmOpfsError(
      "byte-length-mismatch",
      `SQLite database asset size mismatch for ${options.assetUrl}: expected ${options.byteLength}, got ${bytes.byteLength}.`,
    )
  }
  return bytes
}

export async function ensureOpfsSAHPoolDatabase(
  poolUtil: SqliteWasmSAHPoolUtil,
  options: OpfsSAHPoolMaterializeOptions,
): Promise<EnsureOpfsSAHPoolDatabaseResult> {
  normalizeOpfsName(options.name)

  let existingManifest: OpfsSAHPoolManifest | null
  try {
    existingManifest = await readOpfsSAHPoolManifest(options)
  } catch (error) {
    throw new SqliteWasmOpfsError(
      "manifest-read-failed",
      `Failed to read OPFS manifest for ${options.name}.`,
      error,
    )
  }

  if (isManifestCurrent(poolUtil, options, existingManifest)) {
    return { name: options.name, manifest: existingManifest!, status: "reused" }
  }

  let bytes: Uint8Array
  try {
    bytes = await fetchDatabaseBytes(options)
  } catch (error) {
    if (error instanceof SqliteWasmOpfsError) {
      throw error
    }
    throw new SqliteWasmOpfsError(
      "fetch-failed",
      `Failed to fetch SQLite database asset for ${options.name}.`,
      error,
    )
  }

  try {
    await poolUtil.importDb(options.name, bytes)
  } catch (error) {
    throw new SqliteWasmOpfsError(
      "import-failed",
      `Failed to import SQLite database asset into OPFS: ${options.name}.`,
      error,
    )
  }

  const manifest: OpfsSAHPoolManifest = {
    name: options.name,
    assetUrl: options.assetUrl,
    assetVersion: options.assetVersion,
    byteLength: bytes.byteLength,
    importedAt: new Date().toISOString(),
  }

  try {
    await writeOpfsSAHPoolManifest(options, manifest)
  } catch (error) {
    throw new SqliteWasmOpfsError(
      "manifest-write-failed",
      `Failed to write OPFS manifest for ${options.name}.`,
      error,
    )
  }

  return { name: options.name, manifest, status: "imported" }
}

function toFailure(error: unknown): SqliteWasmOpfsFailure {
  if (error instanceof SqliteWasmOpfsError) {
    return { ok: false, reason: error.reason, error }
  }
  const wrapped = new SqliteWasmOpfsError("unsupported", String(error), error)
  return { ok: false, reason: wrapped.reason, error: wrapped }
}

export async function tryEnsureOpfsSAHPoolDatabase(
  poolUtil: SqliteWasmSAHPoolUtil,
  options: OpfsSAHPoolMaterializeOptions,
): Promise<{ ok: true; result: EnsureOpfsSAHPoolDatabaseResult } | SqliteWasmOpfsFailure> {
  try {
    if (!isOpfsSAHPoolSupported()) {
      throw new SqliteWasmOpfsError(
        "unsupported",
        "SQLite wasm opfs-sahpool requires OPFS APIs in a Worker context.",
      )
    }
    return {
      ok: true,
      result: await ensureOpfsSAHPoolDatabase(poolUtil, options),
    }
  } catch (error) {
    return toFailure(error)
  }
}
