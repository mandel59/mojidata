#!/usr/bin/env node
import type { Writable } from "stream"
import { argparse } from "../lib/argparse"
import { IDSFinder } from "../lib/ids-finder"

function showUsage() {
    console.log("Usage:")
    console.log("\tids-find IDS_X [IDS_X ...]")
    console.log("\tids-find --whole=IDS [IDS_X ...]")
    console.log("\tids-find --help")
}

function showHelp() {
    showUsage()
    console.log("IDS syntax:")
    console.log('\tIDS_X ::= IDS Multiplicity?')
    console.log('\tIDS ::= IDS_Variable | IDS_Component | IDS_UnaryOperator IDS | IDS_BinaryOperator IDS IDS | IDS_TernaryOperator IDS IDS IDS')
    console.log('\tIDS_Variable ::= [a-z]')
    console.log('\tIDS_Component ::= Ideographic | Radical | CJK_Stroke | Private_Use | "？"')
    console.log('\tIDS_UnaryOperator ::= "〾" | "↔" | "↷"')
    console.log('\tIDS_BinaryOperator ::= "⿰" | "⿱" | "⿴" | "⿵" | "⿶" | "⿷" | "⿸" | "⿹" | "⿺" | "⿻" | "⿼" | "⿽"')
    console.log('\tIDS_TernaryOperator ::= "⿲" | "⿳"')
    console.log('\tMultiplicity ::= "*" [0-9]+')
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
    console.log("\tids-find 木 '耳*3'")
    console.log("\t\tFind characters including 木 and three 耳")
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
    const allResults = Boolean(options.get("--all-results") || options.get("-A"))
    const args = argv.map(x => x.replace(/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, ""))
    const whole = options.get("--whole")
    if (typeof whole === "string" && whole !== "") {
        args.unshift(`§${whole}§`)
    }
    if (args.length === 0) {
        showUsage()
        process.exit(1)
    }
    const idsfinder = new IDSFinder()
    const debugQuery = options.get("--debug-query")
    if (typeof debugQuery === "string") {
        console.log(idsfinder.debugQuery(debugQuery, ...args))
        return
    }
    for (const result of idsfinder.find(...args)) {
        if (!allResults && result[0] === '&') {
            continue
        }
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
