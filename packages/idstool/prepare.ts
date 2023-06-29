import fs from "fs"
import path from "path"
import Database from "better-sqlite3"
import { transactionSync } from "./lib/dbutils"
import { IDSDecomposer } from "./lib/ids-decomposer"
import { tokenizeIDS } from "./lib/ids-tokenizer"

const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

const dbpath = path.join(__dirname, "idsfind.db")
fs.rmSync(dbpath, { force: true })
const db = new Database(dbpath)

db.prepare(`ATTACH DATABASE ? AS moji`).run(mojidb)
const symbols_in_ids = new Set<string>()
for (const ids of db.prepare<[], ["IDS"], { IDS: string }>(`SELECT IDS from moji.ids`).pluck().iterate() as Iterable<string>) {
    ids.match(/[\p{Sm}\p{So}\p{Po}]/gu)?.forEach(c => symbols_in_ids.add(c))
}
const usource = db.prepare<[], ["U_source_ID", "IDS"], { U_source_ID: string, IDS: string }>(`SELECT U_source_ID, IDS FROM moji.usource WHERE IDS is not null`).all()
db.exec(`DETACH DATABASE moji`)

db.exec(`drop table if exists "idsfind"`)
db.exec(`CREATE TABLE "idsfind" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
db.exec(`CREATE INDEX "idsfind_UCS" ON "idsfind" (UCS)`)
db.exec(`CREATE TEMPORARY TABLE "idsfind_temp" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
const insert_idsfind = db.prepare<[{ ucs: string, tokens: string }], [], {}, void>(`INSERT INTO "idsfind_temp" VALUES ($ucs, $tokens)`)

const decomposer = new IDSDecomposer({
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

db.exec(`INSERT INTO idsfind (UCS, IDS_tokens) SELECT DISTINCT UCS, IDS_tokens FROM idsfind_temp`)

db.exec(`drop table if exists "idsfind_fts"`)
db.exec(`CREATE TABLE "idsfind_ref" (docid INTEGER PRIMARY KEY, char TEXT NOT NULL)`)
db.exec(`CREATE INDEX "idsfind_ref_char" ON "idsfind_ref" (char)`)
db.exec(`INSERT INTO idsfind_ref (docid, char) SELECT rowid, UCS FROM idsfind`)
db.exec(`CREATE VIRTUAL TABLE "idsfind_fts" USING fts4 (
    content="",
    tokenize=unicode61 "tokenchars={}&-;§${Array.from(symbols_in_ids).join("")}",
    "IDS_tokens"
)`)
db.exec(`INSERT INTO idsfind_fts (docid, IDS_tokens) SELECT
    (SELECT docid FROM idsfind_ref WHERE char = UCS) AS docid,
    '§ ' || group_concat(IDS_tokens, ' § ') || ' §'
FROM idsfind
GROUP BY UCS`)
db.exec(`DROP INDEX "idsfind_ref_char"`)

db.exec(`PRAGMA journal_mode = delete`)
db.exec(`PRAGMA page_size = 1024`)
db.exec(`INSERT INTO idsfind_fts (idsfind_fts) VALUES ('optimize')`)
db.exec(`VACUUM`)
