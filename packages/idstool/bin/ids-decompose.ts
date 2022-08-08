#!/usr/bin/env node
import { tokenizeIDS } from "../lib/ids-tokenizer"
import { applyOperators } from "../lib/ids-operator"
import { IDSDecomposer } from "../lib/ids-decomposer"
import { argparse } from "../lib/argparse"
const { argv, options } = argparse(process.argv.slice(2))
if (argv.length === 0) {
    showUsage()
    process.exit(1)
}
function showUsage() {
    console.log("usage: ids-decompose IDS [IDS ...]")
}

const decomposer
    = new IDSDecomposer({
        expandZVariants: Boolean(options.get("-z") || options.get("--expandZVariants")),
        idstable: "ids_draft",
    })

const queryMode = Boolean(options.get("-q" || options.get("--query")))

for (const arg of argv) {
    const s = new Set()
    for (const tokens of decomposer.decomposeTokens(tokenizeIDS(arg))) {
        try {
            const ids = Array.from(applyOperators(tokens)).join('')
            if (!s.has(ids)) {
                s.add(ids)
                if (queryMode) {
                    console.log(`§${ids}§`)
                } else {
                    console.log(ids)
                }
            }
        } catch {
            // ignore errors
        }
    }
}
