#!/usr/bin/env node
import type { Writable } from "stream"
import { argparse } from "../lib/argparse"
import { IDSFinder } from "../lib/ids-finder"

function showUsage() {
    console.log("usage: ids-find IDS [IDS ...]")
}

function drain(ws: Writable) {
    return new Promise(resolve => {
        ws.once('drain', resolve)
    })
}

async function main() {
    const { argv, options } = argparse(process.argv.slice(2))
    const args = [...argv]
    const whole = options.get("--whole")
    if (typeof whole === "string" && whole !== "") {
        args.unshift(`§${whole}§`)
    }
    if (args.length === 0) {
        showUsage()
        process.exit(1)
    }
    const idsfinder = new IDSFinder()
    for (const result of idsfinder.find(...args)) {
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
