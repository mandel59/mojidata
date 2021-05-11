import path from "path"
import { tokenizeIDS } from "./lib/ids-tokenizer"
import { IDSDecomposer } from "./lib/ids-decomposer"

const dbpath = path.join(__dirname, "../dist/moji.db")
const decomposer
    = new IDSDecomposer(dbpath)

if (!process.argv[2]) {
    throw new Error("no arg")
}
for (const tokens of decomposer.decomposeTokens(tokenizeIDS(process.argv[2]))) {
    console.log(tokens.join(' '))
}
