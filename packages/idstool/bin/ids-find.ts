#!/usr/bin/env node
import type { Writable } from "stream"
import path from "path"
import Database from "better-sqlite3"
import { tokenizeIDS } from "../lib/ids-tokenizer"
import { query } from "../lib/idsfind-query"
import { argparse } from "../lib/argparse"
const { argv, options } = argparse(process.argv.slice(2))
if (argv.length === 0) {
    showUsage()
    process.exit(1)
}
function showUsage() {
    console.log("usage: ids-find IDS [IDS...]")
}

const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

const dbpath = path.join(__dirname, "../idsfind.db")
const db = new Database(dbpath)

db.function("tokenizeIDS", (ids: string) => JSON.stringify(tokenizeIDS(ids)))

const find = db.prepare<{ idslist: string }>(query).pluck()

function drain(ws: Writable) {
    return new Promise(resolve => {
        ws.once('drain', resolve)
    })
}

async function main() {
    for (const result of find.iterate({
        idslist: JSON.stringify(argv.map(arg => tokenizeIDS(arg)))
    })) {
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
