import { createHash } from "crypto"
import Database from "better-sqlite3"
import { transactionSync } from "@mandel59/idsdb-utils/node"
import {
    encodeIdsBvec,
    idsBvecFeatureVersion,
    idsBvecRecordBytes,
    idsBvecUnion,
} from "@mandel59/idsdb-utils"
function popcount32(value: number) {
    let x = value >>> 0
    x -= (x >>> 1) & 0x55555555
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

export function buildIdsfindBvec(db: Database.Database) {
    const blockSizeText = process.env.MOJIDATA_IDSDB_BVEC_BLOCK_SIZE ?? "1024"
    const blockSize = Number(blockSizeText)
    if (!Number.isSafeInteger(blockSize) || blockSize <= 0 || blockSize > 65536) {
        throw new Error(`Invalid MOJIDATA_IDSDB_BVEC_BLOCK_SIZE: ${blockSizeText}`)
    }
    db.exec(`CREATE TABLE idsfind_bvec_meta (
        schema_version INTEGER PRIMARY KEY CHECK (schema_version = 1),
        feature_version TEXT NOT NULL,
        byte_order TEXT NOT NULL CHECK (byte_order = 'little'),
        word_count INTEGER NOT NULL CHECK (word_count = 4),
        record_bytes INTEGER NOT NULL CHECK (record_bytes = 16),
        block_size INTEGER NOT NULL, row_count INTEGER NOT NULL,
        idsfind_digest TEXT NOT NULL
    )`)
    db.exec(`CREATE TABLE idsfind_bvec_block (
        block_id INTEGER PRIMARY KEY, first_rowid INTEGER NOT NULL UNIQUE,
        row_count INTEGER NOT NULL, union0 INTEGER NOT NULL, union1 INTEGER NOT NULL,
        union2 INTEGER NOT NULL, union3 INTEGER NOT NULL, max_weight INTEGER NOT NULL,
        vectors BLOB NOT NULL, CHECK (length(vectors) = row_count * 16)
    )`)
    const insertBlock = db.prepare(`INSERT INTO idsfind_bvec_block VALUES (
        $blockId, $firstRowid, $rowCount, $union0, $union1, $union2, $union3, $maxWeight, $vectors
    )`)
    const digest = createHash("sha256")
    let blockId = 0
    let firstRowid = 0
    let vectors: [number, number, number, number][] = []
    let rowCount = 0
    const flush = () => {
        if (vectors.length === 0) return
        const packed = Buffer.alloc(vectors.length * idsBvecRecordBytes)
        const union = [0, 0, 0, 0]
        let maxWeight = 0
        for (let row = 0; row < vectors.length; row++) {
            const vector = vectors[row]
            for (let word = 0; word < 4; word++) {
                packed.writeUInt32LE(vector[word] >>> 0, row * idsBvecRecordBytes + word * 4)
                union[word] = (union[word] | vector[word]) >>> 0
            }
            maxWeight = Math.max(maxWeight, popcount32(idsBvecUnion(vector)))
        }
        insertBlock.run({ blockId, firstRowid, rowCount: vectors.length,
            union0: union[0], union1: union[1], union2: union[2], union3: union[3],
            maxWeight, vectors: packed })
        blockId++
        vectors = []
    }
    transactionSync(db, () => {
        const rows = db.prepare(`SELECT rowid, UCS, IDS_tokens FROM idsfind ORDER BY rowid`).all() as {
            rowid: number; UCS: string; IDS_tokens: string
        }[]
        for (const row of rows) {
            if (vectors.length === 0) firstRowid = row.rowid
            let vector: [number, number, number, number]
            try {
                vector = [...encodeIdsBvec(row.IDS_tokens.split(" "))]
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                throw new Error(`Cannot encode idsfind row ${row.rowid} (${row.UCS}): ${row.IDS_tokens}: ${message}`)
            }
            vectors.push(vector)
            digest.update(`${row.rowid}\u0000${row.UCS}\u0000${row.IDS_tokens}\n`, "utf8")
            rowCount++
            if (vectors.length === blockSize) flush()
        }
        flush()
        db.prepare(`INSERT INTO idsfind_bvec_meta VALUES (1, ?, 'little', 4, 16, ?, ?, ?)`).run(
            idsBvecFeatureVersion, blockSize, rowCount, digest.digest("hex"))
    })
}
