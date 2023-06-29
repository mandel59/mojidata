#!/usr/bin/env node
import Database = require("better-sqlite3")
import { queryExpressions } from "./query-expressions"
const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

const db = new Database(mojidb)

function argparse(argv: string[]) {
    return {
        argv: argv.filter(arg => !arg.startsWith("-")),
        options: new Map(
            process.argv.slice(2).flatMap((arg): [string, any][] => {
                if (arg.startsWith("--")) {
                    if (arg.includes("=")) {
                        const m = /^(--[^=]*)=([\s\S]*)$/.exec(arg)!
                        const name = m[1]
                        const value = m[2]
                        return [[name, value]]
                    }
                    return [[arg, true]]
                }
                if (arg[0] === "-") {
                    return Array.from(arg.slice(1), flag => ["-" + flag, true])
                }
                return []
            }))
    }
}

function help() {
    console.log("Usage: mojidata [--select=FIELD[,FIELD...]] CHAR [CHAR...]")
    console.log("\tYou can specify CHAR with Unicode scalar value e.g. U+4E00")
    console.log("Available Fields:")
    for (const [name, e] of queryExpressions) {
        console.log(`\t${name}`)
    }
}

function buildQuery(selection: Set<string>) {
    const a = [];
    const selectAll = selection.size === 0;
    for (const [name, e] of queryExpressions) {
        if (selectAll || selection.has(name)) {
            a.push(`'${name}', ${e}`)
        }
    }
    return `SELECT json_object(${a.join(',')}) AS vs`;
}

function printMojidata(args: string[], selection: string[]) {
    const query = buildQuery(new Set(selection))
    const stmt = db.prepare<{ ucs: string }>(query).pluck()
    for (let s of args) {
        if (s.startsWith('U+')) {
            s = String.fromCodePoint(Number.parseInt(s.substr(2), 16))
        }
        if (s[0] <= '\u00ff') {
            // ignore unknown arguments
            // TODO: handle invalid arguments properly
            return
        }
        for (const c of s) {
            const value = stmt.get({ ucs: c })
            console.log(value)
        }
    }
}

function main() {
    const { argv, options } = argparse(process.argv.slice(2))
    if (argv.length === 0) {
        help()
        process.exit(1)
    }
    const selection = (options.get('--select') as string | undefined)
        ?.split(',')
        .map(x => x.trim())
        .filter(x => x)
    printMojidata(argv, selection ?? [])

}

main()
