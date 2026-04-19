import fs from "fs"
import path from "path"
import Database from "better-sqlite3"
import { transactionSync } from "@mandel59/idsdb-utils/node"
import { IDSDecomposer } from "@mandel59/idsdb-utils/node"
import { tokenizeIDS } from "@mandel59/idsdb-utils"

function getIdsfindFtsModule() {
    const requested = process.env.MOJIDATA_IDSDB_FTS_VERSION ?? "4"
    if (requested !== "4" && requested !== "5") {
        throw new Error(
            `Unsupported MOJIDATA_IDSDB_FTS_VERSION: ${requested} (expected "4" or "5")`,
        )
    }
    return `fts${requested}` as const
}

function getIdsfindTokenizerClause(
    ftsModule: "fts4" | "fts5",
    symbolsInIds: Iterable<string>,
) {
    const tokenchars = `{}&-;§${Array.from(symbolsInIds).join("")}`
    if (ftsModule === "fts4") {
        return `tokenize=unicode61 "tokenchars=${tokenchars}"`
    }
    const escaped = tokenchars.replace(/'/g, "''")
    return `tokenize = "unicode61 tokenchars '${escaped}'"`
}

function resolvePnpVirtualPath(filePath: string) {
    if (!path.isAbsolute(filePath)) {
        return filePath
    }
    try {
        // Yarn PnP can return virtual paths that native modules (sqlite) can't open.
        const pnp = require("pnpapi") as { resolveVirtual?: (p: string) => string | null }
        return pnp.resolveVirtual?.(filePath) ?? filePath
    } catch {
        return filePath
    }
}

async function main() {
    const idsfindFtsModule = getIdsfindFtsModule()
    const mojidb = resolvePnpVirtualPath(require.resolve("@mandel59/mojidata/dist/moji.db"))

    const dbpath = path.join(__dirname, "idsfind.db")
    fs.rmSync(dbpath, { force: true })
    fs.rmSync(path.join(__dirname, "idsdecompose.db"), { force: true })
    const db = new Database(dbpath)

    db.prepare(`ATTACH DATABASE ? AS moji`).run(mojidb)
    const symbols_in_ids = new Set<string>()
    for (const ids of db.prepare(`SELECT IDS from moji.ids`).pluck().iterate() as Iterable<string>) {
        ids.match(/[\p{Sm}\p{So}\p{Po}]/gu)?.forEach(c => symbols_in_ids.add(c))
    }
    const idsfindTokenizerClause = getIdsfindTokenizerClause(
        idsfindFtsModule,
        symbols_in_ids,
    )
    const usource = db.prepare(`SELECT U_source_ID, IDS FROM moji.usource WHERE IDS is not null`).all() as { U_source_ID: string, IDS: string }[]
    db.exec(`DETACH DATABASE moji`)

    db.exec(`drop table if exists "idsfind"`)
    db.exec(`CREATE TABLE "idsfind" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
    db.exec(`CREATE INDEX "idsfind_UCS" ON "idsfind" (UCS)`)
    db.exec(`CREATE TEMPORARY TABLE "idsfind_temp" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
    const insert_idsfind = db.prepare(`INSERT INTO "idsfind_temp" VALUES ($ucs, $tokens)`)

    const decomposer = await IDSDecomposer.create({
        dbpath: path.join(__dirname, "idsdecompose.db"),
        expandZVariants: true,
        normalizeKdpvRadicalVariants: true,
        idstable: "ids",
        unihanPrefix: "unihan",
    })

    function showProgressForEach<T>(array: T[], proc: (value: T) => void) {
        const n = array.length
        let i = 0
        let p = 0
        for (const value of array) {
            proc(value)
            i++
            const p1 = Math.floor(i / n * 100)
            if (p1 > p) {
                p = p1
                console.log("%d%% (%d/%d)", p, i, n)
            }
        }
    }

    const allCharSources: {
        char: string;
        IDS?: string;
        source: string;
    }[] = [
        ...decomposer.allCharSources(),
        ...usource.map(({ U_source_ID, IDS }) => ({
            char: `&${U_source_ID};`,
            IDS,
            source: 'U',
        })),
    ]
    transactionSync(db, () => {
        const n = allCharSources.length
        console.log("total", n)
        showProgressForEach(allCharSources, ({ char, IDS, source }) => {
            const alltokens = IDS
                ? decomposer.decomposeTokens(tokenizeIDS(IDS), source)
                : decomposer.decomposeAll(char, source)
            for (const tokens of alltokens) {
                ;(insert_idsfind as any).run({ ucs: char, tokens: tokens.join(' ') })
            }
        })
        const allFallbacks = decomposer.allFallbacks()
        const nf = allFallbacks.length
        console.log("fallback", nf)
        showProgressForEach(allFallbacks, ({ char, source }) => {
            const alltokens = decomposer.decomposeAll(char, source)
            for (const tokens of alltokens) {
                ;(insert_idsfind as any).run({ ucs: char, tokens: tokens.join(' ') })
            }
        })
    })

    decomposer.saveToFile()
    decomposer.close()

    db.exec(`INSERT INTO idsfind (UCS, IDS_tokens) SELECT DISTINCT UCS, IDS_tokens FROM idsfind_temp`)

    db.exec(`drop table if exists "idsfind_fts"`)
    db.exec(`CREATE TABLE "idsfind_ref" (docid INTEGER PRIMARY KEY, char TEXT NOT NULL)`)
    db.exec(`CREATE INDEX "idsfind_ref_char" ON "idsfind_ref" (char)`)
    db.exec(`INSERT INTO idsfind_ref (docid, char) SELECT rowid, UCS FROM idsfind`)
    db.exec(`CREATE VIRTUAL TABLE "idsfind_fts" USING ${idsfindFtsModule} (
    content="",
    ${idsfindTokenizerClause},
    "IDS_tokens"
)`)
    db.exec(`INSERT INTO idsfind_fts (rowid, IDS_tokens) SELECT
    (SELECT docid FROM idsfind_ref WHERE char = UCS) AS rowid,
    '§ ' || group_concat(IDS_tokens, ' § ') || ' §'
FROM idsfind
GROUP BY UCS`)
    db.exec(`DROP INDEX "idsfind_ref_char"`)

    db.exec(`PRAGMA journal_mode = delete`)
    db.exec(`PRAGMA page_size = 1024`)
    db.exec(`INSERT INTO idsfind_fts (idsfind_fts) VALUES ('optimize')`)
    db.exec(`VACUUM`)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
