import { IDSDecomposer } from "./ids-decomposer"
import { SQLite3Constructor, SQLite3Database } from "./interface/sqlite3"

export async function prepare(dbconstructor: SQLite3Constructor, mojidb: SQLite3Database, idsfinddb: SQLite3Database) {
    const db = idsfinddb
    const symbols_in_ids = new Set<string>()
    for (const { IDS: ids } of (mojidb.prepare<[], { IDS: string }>(`SELECT IDS from ids`)).iterate([])) {
        ids.match(/[\p{Sm}\p{So}\p{Po}]/gu)?.forEach(c => symbols_in_ids.add(c))
    }

    db.run(`drop table if exists "idsfind"`)
    db.run(`CREATE TABLE "idsfind" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
    db.run(`CREATE INDEX "idsfind_UCS" ON "idsfind" (UCS)`)
    db.run(`CREATE TEMPORARY TABLE "idsfind_temp" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
    const insert_idsfind = db.prepare<{ ucs: string, tokens: string }, {}>(`INSERT INTO "idsfind_temp" VALUES ($ucs, $tokens)`)

    const zVariants = new Map<string, string[]>()
    for (const { UCS, value } of mojidb.prepare<[], { UCS: string, value: string }>("SELECT UCS, value from unihan_kZVariant").iterate([])) {
        zVariants.set(
            UCS,
            [
                UCS,
                ...value
                    .split(/ /g)
                    .map(x =>
                        String.fromCodePoint(
                            parseInt(x.substr(2), 16)))])
    }

    const decomposer = await IDSDecomposer.create(
        dbconstructor,
        mojidb.prepare<[], { UCS: string, source: string, IDS: string }>("SELECT UCS, source, IDS from ids").iterate([]),
        { zVariants })

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

    const allCharSources = decomposer.allCharSources()
    db.transaction(() => {
        const n = allCharSources.length
        console.log("total", n)
        showProgressForEach(allCharSources, async ({ char, source }) => {
            const alltokens = decomposer.decomposeAll(char, source)
            for (const tokens of alltokens) {
                insert_idsfind.run({ ucs: char, tokens: tokens.join(' ') })
            }
        })
        const allFallbacks = decomposer.allFallbacks()
        const nf = allFallbacks.length
        console.log("fallback", nf)
        showProgressForEach(allFallbacks, ({ char, source }) => {
            const alltokens = decomposer.decomposeAll(char, source)
            for (const tokens of alltokens) {
                insert_idsfind.run({ ucs: char, tokens: tokens.join(' ') })
            }
        })
    })

    db.run(`INSERT INTO idsfind (UCS, IDS_tokens) SELECT DISTINCT UCS, IDS_tokens FROM idsfind_temp`)

    db.run(`drop table if exists "idsfind_fts"`)
    db.run(`CREATE VIRTUAL TABLE "idsfind_fts" USING fts4 (
    content="",
    tokenize=unicode61 "tokenchars={}&-;§${Array.from(symbols_in_ids).join("")}",
    "IDS_tokens"
)`)
    db.run(`INSERT INTO idsfind_fts (docid, IDS_tokens) SELECT unicode(UCS) AS docid, '§ ' || group_concat(IDS_tokens, ' § ') || ' §' FROM idsfind WHERE length(UCS) = 1 GROUP BY unicode(UCS)`)

    db.run(`PRAGMA journal_mode = delete`)
    db.run(`PRAGMA page_size = 1024`)
    db.run(`INSERT INTO idsfind_fts (idsfind_fts) VALUES ('optimize')`)
    db.run(`VACUUM`)
}
