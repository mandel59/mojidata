#!/usr/bin/env node
import { createSqlJsDb } from "@mandel59/mojidata-api-sqljs"

const db = createSqlJsDb()

function help() {
    console.log("usage: ivs-list CHAR")
}

async function printIvsList(c: string) {
    const ivsList = await db.getIvsList(c)
    for (const ivs of ivsList) {
        console.log(JSON.stringify(ivs))
    }
}

async function main() {
    const argv = process.argv.slice(2)
    if (argv.length === 0) {
        help()
        process.exit(1)
    }

    for (const arg of argv) {
        for (const c of arg) {
            if (c <= '\u00ff') continue
            await printIvsList(c)
        }
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
