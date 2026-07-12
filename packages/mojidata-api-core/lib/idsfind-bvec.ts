import {
  idsBvecFeatureVersion,
  idsBvecRecordBytes,
  idsBvecTokenMask,
} from "@mandel59/idsdb-utils"

import type { IdsfindCandidateProvider } from "./idsfind-sql"
import type { SqlExecutor } from "./sql-executor"

type BlockSummary = {
  block_id?: unknown
  first_rowid?: unknown
  row_count?: unknown
  union0?: unknown
  union1?: unknown
  union2?: unknown
  union3?: unknown
  vectors?: unknown
}

const rowidBatchSize = 4096

function asInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid idsfind bvec ${field}`)
  }
  return value
}

function asBytes(value: unknown) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  ) {
    return Uint8Array.from(value)
  }
  throw new Error("Unsupported idsfind bvec BLOB representation")
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function maskMatches(union: number, mask: number) {
  return (((union >>> 0) & (mask >>> 0)) >>> 0) === (mask >>> 0)
}

function groupsMatch(union: number, groups: number[][]) {
  return groups.every((alternatives) =>
    alternatives.some((mask) => maskMatches(union, mask)),
  )
}

async function compileMasks(db: SqlExecutor, idslist: string[][][]) {
  const decompositionCache = new Map<string, Promise<string[][]>>()
  const getAlternatives = (token: string) => {
    let promise = decompositionCache.get(token)
    if (!promise) {
      promise = db
        .query<{ IDS_tokens?: unknown }>(
          `SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`,
          { $ucs: token },
        )
        .then((rows) => {
          const decompositions = rows.flatMap((row) =>
            typeof row.IDS_tokens === "string"
              ? [row.IDS_tokens.split(" ")]
              : [],
          )
          return decompositions.length === 0 ? [[token]] : decompositions
        })
      decompositionCache.set(token, promise)
    }
    return promise
  }

  const groups: number[][] = []
  for (const patterns of idslist) {
    const masks: number[] = []
    for (const pattern of patterns) {
      let alternatives = [0]
      for (const token of pattern) {
        if (
          token === "§" ||
          token === "？" ||
          /^[a-zａ-ｚ]$/u.test(token)
        ) {
          continue
        }
        const tokenAlternatives = await getAlternatives(token)
        alternatives = alternatives.flatMap((mask) =>
          tokenAlternatives.map((tokens) =>
            tokens.reduce(
              (value, item) => value | idsBvecTokenMask(item),
              mask,
            ) >>> 0,
          ),
        )
      }
      masks.push(...alternatives)
    }
    groups.push([...new Set(masks)])
  }
  return groups
}

async function validateSchema(db: SqlExecutor) {
  const meta = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM idsfind_bvec_meta WHERE schema_version = 1`,
  )
  if (
    meta?.feature_version !== idsBvecFeatureVersion ||
    meta.byte_order !== "little" ||
    meta.word_count !== 4 ||
    meta.record_bytes !== idsBvecRecordBytes
  ) {
    throw new Error("Unsupported idsfind bvec schema or feature version")
  }
  const rowCount = asInteger(meta.row_count, "meta row_count")
  const exact = await db.queryOne<{
    row_count?: unknown
    min_rowid?: unknown
    max_rowid?: unknown
  }>(
    `SELECT count(*) AS row_count, min(rowid) AS min_rowid,
      max(rowid) AS max_rowid FROM idsfind`,
  )
  if (
    exact?.row_count !== rowCount ||
    exact.min_rowid !== 1 ||
    exact.max_rowid !== rowCount
  ) {
    throw new Error("idsfind rowids do not match the bvec metadata")
  }
  return rowCount
}

export function createBvecIdsfindCandidateProvider(): IdsfindCandidateProvider {
  const validatedRowCounts = new WeakMap<SqlExecutor, number>()
  return {
    async getCandidates(db, idslist) {
      let expectedRowCount = validatedRowCounts.get(db)
      if (expectedRowCount === undefined) {
        expectedRowCount = await validateSchema(db)
        validatedRowCounts.set(db, expectedRowCount)
      }
      const groups = await compileMasks(db, idslist)
      const summaries = await db.query<BlockSummary>(`SELECT
        block_id, first_rowid, row_count, union0, union1, union2, union3
        FROM idsfind_bvec_block ORDER BY block_id`)
      let expectedFirstRowid = 1
      const acceptedBlockIds = summaries.flatMap((block) => {
        const firstRowid = asInteger(block.first_rowid, "first_rowid")
        const rowCount = asInteger(block.row_count, "row_count")
        if (firstRowid !== expectedFirstRowid || rowCount <= 0) {
          throw new Error("idsfind bvec blocks are not contiguous")
        }
        expectedFirstRowid += rowCount
        const union = (
          asInteger(block.union0, "union0") |
          asInteger(block.union1, "union1") |
          asInteger(block.union2, "union2") |
          asInteger(block.union3, "union3")
        ) >>> 0
        return groupsMatch(union, groups) ? [asInteger(block.block_id, "block_id")] : []
      })
      if (expectedFirstRowid !== expectedRowCount + 1) {
        throw new Error("idsfind bvec block row counts do not match metadata")
      }
      if (acceptedBlockIds.length === 0) return []

      const blocks = await db.query<BlockSummary>(`SELECT
        block_id, first_rowid, row_count, vectors
        FROM idsfind_bvec_block
        WHERE block_id IN (SELECT value FROM json_each($blockids))
        ORDER BY block_id`, { $blockids: JSON.stringify(acceptedBlockIds) })
      const rowids: number[] = []
      for (const block of blocks) {
        const firstRowid = asInteger(block.first_rowid, "first_rowid")
        const rowCount = asInteger(block.row_count, "row_count")
        const bytes = asBytes(block.vectors)
        if (bytes.byteLength !== rowCount * idsBvecRecordBytes) {
          throw new Error("Invalid idsfind bvec block length")
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        for (let row = 0; row < rowCount; row++) {
          let union = 0
          for (let word = 0; word < 4; word++) {
            union |= view.getUint32(row * idsBvecRecordBytes + word * 4, true)
          }
          if (groupsMatch(union >>> 0, groups)) rowids.push(firstRowid + row)
        }
      }

      const candidates: string[] = []
      const seen = new Set<string>()
      for (const batch of chunks(rowids, rowidBatchSize)) {
        const rows = await db.query<{ UCS?: unknown }>(`SELECT UCS FROM idsfind
          WHERE rowid IN (SELECT value FROM json_each($rowids)) ORDER BY rowid`,
          { $rowids: JSON.stringify(batch) })
        for (const row of rows) {
          if (typeof row.UCS === "string" && !seen.has(row.UCS)) {
            seen.add(row.UCS)
            candidates.push(row.UCS)
          }
        }
      }
      return candidates
    },
  }
}
