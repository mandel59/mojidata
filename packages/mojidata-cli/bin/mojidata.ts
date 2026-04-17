#!/usr/bin/env node
import { createNodeDb } from "@mandel59/mojidata-api/runtime"
import { queryExpressions } from "./query-expressions"

const db = createNodeDb()

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

async function printMojidata(args: string[], selection: string[]) {
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
            const value = await db.getMojidataJson(c, selection)
            console.log(value)
        }
    }
}

async function main() {
    const { argv, options } = argparse(process.argv.slice(2))
    if (argv.length === 0) {
        help()
        process.exit(1)
    }
    const selection = (options.get('--select') as string | undefined)
        ?.split(',')
        .map(x => x.trim())
        .filter(x => x)
    await printMojidata(argv, selection ?? [])

}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
