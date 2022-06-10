#!/usr/bin/env node
import type { Writable } from "stream"
import { argparse } from "../lib/argparse"
import { IDSFinder } from "../lib/ids-finder"

function showUsage() {
    console.log("Usage:")
    console.log("\tids-find IDS [IDS ...]")
    console.log("\tids-find --whole=IDS [IDS ...]")
    console.log("\tids-find --help")
}

function showHelp() {
    showUsage()
    console.log("Examples:")
    console.log("\tids-find 魚 山")
    console.log("\t\tFind characters including 魚 and 山")
    console.log("\tids-find ⿰日月")
    console.log("\t\tFind characters including ⿰日月 (= 明)")
    console.log("\tids-find ↷")
    console.log("\t\tFind characters with some of their parts upside down")
    console.log("\t\tIncomplete IDSs works here")
    console.log("\tids-find --whole=⿰？魚")
    console.log("\t\tFind characters where their right parts are 魚")
    console.log("IDS Unary Operators:\n\t〾↔↷")
    console.log("IDS Binary Operators:\n\t⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻")
    console.log("IDS Ternary Operators:\n\t⿲⿳")
}

function drain(ws: Writable) {
    return new Promise(resolve => {
        ws.once('drain', resolve)
    })
}

async function main() {
    const { argv, options } = argparse(process.argv.slice(2))
    if (options.get("-h") || options.get("--help")) {
        showHelp()
        process.exit()
    }
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
