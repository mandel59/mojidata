import fs from "fs"
import path from "path"
import Database from "better-sqlite3"
import { transactionSync } from "./lib/dbutils"
import { IDSDecomposer } from "./lib/ids-decomposer"

const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

const dbpath = path.join(__dirname, "idsfind.db")
fs.rmSync(dbpath, { force: true })
const db = new Database(dbpath)

db.prepare(`ATTACH DATABASE ? AS moji`).run(mojidb)
const codepoints: number[] = db.prepare<[]>(`SELECT DISTINCT unicode(UCS) as codepoint FROM moji.ids ORDER BY codepoint`).pluck().all()
const symbols_in_ids = new Set<string>()
for (const ids of db.prepare<[]>(`SELECT IDS from moji.ids`).pluck().iterate() as Iterable<string>) {
    ids.match(/[\p{So}\p{Po}]/gu)?.forEach(c => symbols_in_ids.add(c))
}
db.exec(`DETACH DATABASE moji`)

db.exec(`drop table if exists "idsfind"`)
db.exec(`CREATE TABLE "idsfind" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
db.exec(`CREATE INDEX "idsfind_UCS" ON "idsfind" (UCS)`)
db.exec(`CREATE TEMPORARY TABLE "idsfind_temp" (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
const insert_idsfind = db.prepare<{ ucs: string, tokens: string }>(`INSERT INTO "idsfind_temp" VALUES ($ucs, $tokens)`)

const decomposer = new IDSDecomposer({
    dbpath: path.join(__dirname, "idsdecompose.db"),
    expandZVariants: true,
})
transactionSync(db, () => {
    for (const id of codepoints) {
        const ucs = String.fromCodePoint(id)
        const alltokens = decomposer.decomposeAll(ucs)
        for (const tokens of alltokens) {
            insert_idsfind.run({ ucs, tokens: tokens.join(' ') })
        }
    }
})

db.exec(`INSERT INTO idsfind (UCS, IDS_tokens) SELECT DISTINCT UCS, IDS_tokens FROM idsfind_temp`)

db.exec(`drop table if exists "idsfind_fts"`)
db.exec(`CREATE VIRTUAL TABLE "idsfind_fts" USING fts4 (
    content="",
    tokenize=unicode61 "tokenchars={}&-;${Array.from(symbols_in_ids).join("")}",
    "IDS_tokens"
)`)
db.exec(`INSERT INTO idsfind_fts (docid, IDS_tokens) SELECT unicode(UCS) AS docid, group_concat(IDS_tokens, ' ; ') FROM idsfind GROUP BY unicode(UCS)`)

db.exec(`PRAGMA journal_mode = delete`)
db.exec(`PRAGMA page_size = 1024`)
db.exec(`INSERT INTO idsfind_fts (idsfind_fts) VALUES ('optimize')`)
db.exec(`VACUUM`)
