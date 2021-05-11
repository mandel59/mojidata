import path from "path"
import { tokenizeIDS } from "./lib/ids-tokenizer"
import { IDSDecomposer } from "./lib/ids-decomposer"

const argv = process.argv.slice(2).filter(arg => !arg.startsWith("-"))
const options: Set<string> = new Set(
    process.argv.slice(2).flatMap(arg => {
        if (arg.startsWith("--")) {
            return [arg]
        }
        if (arg[0] === "-") {
            return Array.from(arg.slice(1), flag => "-" + flag)
        }
        return []
    }))
if (argv.length === 0) {
    throw new Error("no arg")
}

const dbpath = path.join(__dirname, "../dist/moji.db")
const decomposer
    = new IDSDecomposer(dbpath, {
        expandZVariant: options.has("-z") || options.has("--expandZVariant")
    })

for (const arg of argv) {
    for (const tokens of decomposer.decomposeTokens(tokenizeIDS(arg))) {
        console.log(tokens.join(' '))
    }
}
