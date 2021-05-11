import type { Writable } from "stream"
import path from "path"
import Database from "better-sqlite3"
import { tokenizeIDS } from "./lib/ids-tokenizer"
import { IDSDecomposer } from "./lib/ids-decomposer"

const dbpath = path.join(__dirname, "../dist/moji.db")
const db = new Database(dbpath)
const decomposer
    = new IDSDecomposer(dbpath)

if (!process.argv[2]) {
    throw new Error("no arg")
}

const find = db.prepare(
    `select char(docid) AS UCS
    from idsfind_fts
    where IDS_tokens MATCH $query`).pluck()

const query = process.argv.slice(2)
    .map(c =>
        `(${Array.from(decomposer.decomposeTokens(tokenizeIDS(c)), tokens => `"${tokens.join(" ")}"`)
            .join(" OR ")})`)
    .join(" AND ")

function drain(ws: Writable) {
    return new Promise(resolve => {
        ws.once('drain', resolve)
    })
}

async function main() {
    for (const result of find.iterate({ query })) {
        if (!process.stdout.write(result)) {
            await drain(process.stdout)
        }
    }
    process.stdout.write("\n")
}

main().catch(err => {
    console.error(err)
    process.exitCode = 1
})
