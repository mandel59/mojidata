import Database from "better-sqlite3"
import { tokenizeIDS } from "./ids-tokenizer"

function* allCombinations<T>(list: Array<() => Iterable<T>>): Generator<T[]> {
    if (list.length === 0) {
        return
    }
    const [first, ...rest] = list
    if (rest.length === 0) {
        for (const item of first()) {
            yield [item]
        }
        return
    }
    for (const restItems of allCombinations(rest)) {
        for (const item of first()) {
            yield [item, ...restItems]
        }
    }
}

const tokenArgs: Partial<Record<string, number>> = {
    "〾": 1,
    "⿰": 2,
    "⿱": 2,
    "⿲": 3,
    "⿳": 3,
    "⿴": 2,
    "⿵": 2,
    "⿶": 2,
    "⿷": 2,
    "⿸": 2,
    "⿹": 2,
    "⿺": 2,
    "⿻": 2,
    "↔": 1,
    "↷": 1,
}

export class IDSDecomposer {
    db: import("better-sqlite3").Database
    lookupIDSStatement: import("better-sqlite3").Statement<{ char: string }>
    constructor(dbpath: string) {
        const db = new Database(":memory:")
        const tokenize = (s: string) => tokenizeIDS(s).join(' ')
        db.function("tokenize", tokenize)
        db.exec(`attach database "${dbpath}" as moji`)
        db.exec(`create table tempids (UCS, IDS_tokens)`)
        db.exec(`create index tempids_UCS on tempids (UCS)`)
        db.exec(`insert into tempids select UCS, tokenize(IDS) as IDS_tokens FROM moji.ids`)
        db.exec(`detach database moji`)
        this.db = db
        this.lookupIDSStatement = db.prepare(
            `select IDS_tokens
            from tempids
            where UCS = $char
            order by rowid`).pluck()
    }
    *decompose(char: string): Generator<string[]> {
        const alltokens = this.lookupIDSStatement.all({ char }) as string[]
        if (alltokens.length === 0) {
            yield [char]
            return
        }
        let unknownid = 0
        for (const tokens of alltokens) {
            yield tokens.split(/ /g).map(token => {
                if (token === "？") {
                    return `&c-${char}-${++unknownid};`
                } else {
                    return token
                }
            })
        }
    }
    *decomposeAll(char: string): Generator<string[]> {
        for (const tokens of this.decompose(char)) {
            if (tokens.length === 1 || tokens[0] === '〾') {
                yield tokens
            } else {
                yield* this.decomposeTokens(tokens)
            }
        }
    }
    *mapDecomposeAll(tokens: string[]): Generator<() => Iterable<string[]>> {
        let i = 0
        while (i < tokens.length) {
            const token = tokens[i++]
            if (token === "〾") {
                const quotedTokens: string[] = []
                quotedTokens.push(token)
                let argCount = 1
                while (argCount > 0) {
                    const token = tokens[i++]
                    argCount += tokenArgs[token] ?? -1
                    quotedTokens.push(token)
                }
                const tokensList = [quotedTokens]
                yield () => tokensList
                continue
            }
            yield () => this.decomposeAll(token)
        }
    }
    *decomposeTokens(tokens: string[]): Generator<string[]> {
        const allDecomposed = allCombinations(Array.from(this.mapDecomposeAll(tokens)))
        for (const decomposed of allDecomposed) {
            yield decomposed.flat()
        }
    }
}
