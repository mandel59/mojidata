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

const radicals = new Map([
    ["牜", "牛"],
    ["𤣩", "玉"],
    ["礻", "示"],
    ["𥫗", "竹"],
    ["糹", "糸"],
    ["⺼", "肉"],
    ["艹", "艸"],
    ["訁", "言"],
    ["釒", "金"],
    ["飠", "食"],
    ["⺄", "乙"],
    ["⺆", "冂"],
    ["⺈", "刀"],
    ["⺊", "卜"],
    ["⺌", "小"],
    ["⺗", "心"],
    ["⺝", "月"],
    ["⺶", "羊"],
    ["⺸", "羊"],
    ["⺻", "聿"],
])

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

export type IDSDecomposerOptions = {
    expandZVariants?: boolean
    normalizeRadicals?: boolean
}

export class IDSDecomposer {
    db: import("better-sqlite3").Database
    lookupIDSStatement: import("better-sqlite3").Statement<{ char: string }>
    expandZVariants: boolean
    normalizeRadicals: boolean
    zvar?: Map<string, string[]>
    constructor(dbpath: string, options: IDSDecomposerOptions = {}) {
        this.expandZVariants = options.expandZVariants ?? false
        this.normalizeRadicals = options.normalizeRadicals ?? true
        const db = new Database(":memory:")
        const tokenize = (s: string) => tokenizeIDS(s).join(' ')
        db.function("tokenize", tokenize)
        db.exec(`attach database "${dbpath}" as moji`)
        db.exec(`create table tempids (UCS, IDS_tokens)`)
        db.exec(`create index tempids_UCS on tempids (UCS)`)
        db.exec(`insert into tempids select UCS, tokenize(IDS) as IDS_tokens FROM moji.ids`)
        if (this.expandZVariants) {
            this.zvar = new Map(
                db.prepare(`select UCS, value FROM moji.unihan_kZVariant`).all()
                    .map(({ UCS, value }) => {
                        return [
                            UCS as string,
                            [
                                UCS,
                                ...(value as string)
                                    .split(/ /g)
                                    .map(x =>
                                        String.fromCodePoint(
                                            parseInt(x.substr(2), 16)))]]
                    }))
        }
        db.exec(`detach database moji`)
        this.db = db
        this.lookupIDSStatement = db.prepare(
            `select IDS_tokens
            from tempids
            where UCS = $char
            order by rowid`).pluck()
    }
    expand(token: string) {
        return this.zvar?.get(token) ?? [token]
    }
    normalize(token: string) {
        if (this.normalizeRadicals) {
            return radicals.get(token) ?? token
        } else {
            return token
        }
    }
    *decompose(token: string): Generator<string[]> {
        const chars = this.expand(token)
        for (const char of chars) {
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
                        return this.normalize(token)
                    }
                })
            }
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
