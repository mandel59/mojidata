#!/usr/bin/env node
import { tokenizeIDS, applyOperators } from "@mandel59/idsdb-utils"
import { IDSDecomposer } from "@mandel59/idsdb-utils/node"
import { argparse } from "../lib/argparse"

function showUsage() {
    console.log("usage: ids-decompose IDS [IDS ...]")
}

async function main() {
    const { argv, options } = argparse(process.argv.slice(2))
    if (argv.length === 0) {
        showUsage()
        process.exitCode = 1
        return
    }

    const decomposer = await IDSDecomposer.create({
        expandZVariants: Boolean(options.get("-z") || options.get("--expandZVariants")),
        normalizeKdpvRadicalVariants: Boolean(options.get("-n") || options.get("--normalizeKdpvRadicalVariants")),
        idstable: "ids",
        unihanPrefix: "unihan",
    })

    const queryMode = Boolean(options.get("-q") || options.get("--query"))

    const allSources = "BGHJKMPSTUVXZUCS2003"

    const sources = (options.get("--source") === "*" ? allSources : options.get("--source") || allSources).match(/UCS2003|\w/g) ?? []
    const showSource = Boolean(options.get("--show-source"))

    for (const arg of argv) {
        const s = new Set()
        for (const source of sources) {
            for (const tokens of decomposer.decomposeTokens(tokenizeIDS(arg), source)) {
                try {
                    const ids = Array.from(applyOperators(tokens)).join('')
                    if (!showSource && s.has(ids)) {
                        continue
                    }
                    s.add(ids)
                    if (queryMode) {
                        console.log(`§${ids}§`)
                    } else if (showSource) {
                        console.log(source, ids)
                    } else {
                        console.log(ids)
                    }
                } catch {
                    // ignore errors
                }
            }
        }
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
