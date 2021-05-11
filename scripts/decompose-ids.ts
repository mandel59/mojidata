import path from "path"
import { tokenizeIDS } from "./lib/ids-tokenizer"
import { IDSDecomposer } from "./lib/ids-decomposer"
import { argparse } from "./lib/argparse"
const { argv, options } = argparse(process.argv.slice(2))
if (argv.length === 0) {
    throw new Error("no arg")
}

const dbpath = path.join(__dirname, "../dist/moji.db")
const decomposer
    = new IDSDecomposer(dbpath, {
        expandZVariant: Boolean(options.get("-z") || options.get("--expandZVariant"))
    })

for (const arg of argv) {
    for (const tokens of decomposer.decomposeTokens(tokenizeIDS(arg))) {
        console.log(tokens.join(' '))
    }
}
