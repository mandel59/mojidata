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
    })

for (const arg of argv) {
    const s = new Set()
    for (const tokens of decomposer.decomposeTokens(tokenizeIDS(arg))) {
        try {
            const ids = Array.from(applyOperators(tokens)).join('')
            if (!s.has(ids)) {
                s.add(ids)
                console.log(ids)
            }
        } catch {
            // ignore errors
        }
    }
}
