#!/usr/bin/env node
import type { Writable } from "stream"
import path from "path"
import Database from "better-sqlite3"
import { tokenizeIDS } from "../lib/ids-tokenizer"
import { IDSDecomposer } from "../lib/ids-decomposer"
import { argparse } from "../lib/argparse"
const { argv, options } = argparse(process.argv.slice(2))

const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")
const decomposer
    = new IDSDecomposer(mojidb)

const dbpath = path.join(__dirname, "../idsfind.db")
const db = new Database(dbpath)

if (!process.argv[2]) {
    throw new Error("no arg")
}

const find = db.prepare(
    `select char(docid) AS UCS
    from idsfind_fts
    where IDS_tokens MATCH $query`).pluck()

function buildQuery(list: string[], operator = "AND") {
    return "(" + list
        .map(c =>
            `(${Array.from(decomposer.decomposeTokens(tokenizeIDS(c)), tokens => `"${tokens.join(" ")}"`)
                .join(" OR ")})`)
        .join(` ${operator} `) + ")"
}

const notclause = options.has("--not")
    ? " NOT " + buildQuery(options.get("--not")!.split(/[ ,]/g), "OR")
    : ""

const query = buildQuery(argv) + notclause

if (options.get("--debug")) {
    console.log(query)
}

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
