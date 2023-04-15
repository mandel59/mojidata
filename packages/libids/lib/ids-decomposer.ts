import { nodeLength, normalizeOverlaid, tokenArgs } from "./ids-operator"
import { tokenizeIDS } from "./ids-tokenizer"
import { SQLite3Constructor, SQLite3Database, SQLite3Statement } from "./interface/sqlite3"

const encodeMap: Partial<Record<string, string>> = {
    "〾": "V",
    "⿰": "h2",
    "⿱": "v2",
    "⿲": "h3",
    "⿳": "v3",
    "⿴": "fs",
    "⿵": "sa",
    "⿶": "sb",
    "⿷": "sl",
    "⿸": "ul",
    "⿹": "ur",
    "⿺": "ll",
    "⿻": "O",
    "↔": "F",
    "↷": "R",
    "⊖": "S",
}

const idsOperatorRegExp = new RegExp(`^(?:${Object.keys(tokenArgs).join("|")})\$`)

const fallbackSourceOrder = ["G", "T", "H", "K", "J", "B", "U", "*"]

function encodeTokensToXmlName(tokens: string[]) {
    return tokens.join("").replace(/./u, char => {
        return encodeMap[char] ?? char
    })
}

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

export type IDSDecomposerOptions = {
    dbpath?: string
    zVariants?: Map<string, string[]>
}

export class IDSDecomposer {
    private db!: SQLite3Database
    private lookupIDSStatement!: SQLite3Statement<{ char: string, source: string }, { IDS_tokens: string }>
    private insertFallbackStatement!: SQLite3Statement<{ char: string, source: string, fallback: string }, {}>
    private zvar?: Map<string, string[]>
    private constructor() { }
    static async load(
        dbconstructor: SQLite3Constructor,
        dbpath: string,
    ) {
        const decomposer = new IDSDecomposer()
        const db = await dbconstructor(dbpath)
        decomposer.db = db
    }
    static async create(
        dbconstructor: SQLite3Constructor,
        idsTable: Iterable<{ UCS: string, source: string, IDS: string }>,
        options: IDSDecomposerOptions = {},
    ) {
        const decomposer = new IDSDecomposer()
        const dbpath = options.dbpath ?? ":memory:"
        const db = await dbconstructor(dbpath)
        decomposer.db = db
        decomposer.zvar = options.zVariants
        db.run(`drop table if exists tempids`)
        db.run(`create table tempids (UCS, source, IDS_tokens)`)
        const insertIntoTempIds = db.prepare<{ UCS: string, s: string, IDS_tokens: string }, {}>(`insert into tempids values ($UCS, $s, $IDS_tokens)`)
        for (const { UCS, source, IDS } of idsTable) {
            const ss = source.match(/UCS2003|\w/g) ?? []
            const IDS_tokens = tokenizeIDS(IDS).join(" ")
            for (const s of ss) {
                insertIntoTempIds.run({ UCS, s, IDS_tokens })
            }
        }
        db.run(`create index tempids_UCS on tempids (UCS)`)
        db.run(`drop table if exists tempids_UCS_source`)
        db.run(`create table tempids_UCS_source as select distinct UCS, source from tempids`)
        db.run(`drop table if exists fallback`)
        db.run(`create table fallback(UCS, source, fallback)`)
        decomposer.lookupIDSStatement = db.prepare<{ char: string, source: string }, { IDS_tokens: string }>(
            `select distinct IDS_tokens from tempids
            where UCS = $char and source glob $source`)
        decomposer.insertFallbackStatement = db.prepare<{ char: string, source: string, fallback: string }, {}>(
            `insert into fallback(UCS, source, fallback) values ($char, $source, $fallback)`)
        decomposer.replaceSingleWildcardToCharItself()
        decomposer.reduceAllSubtractions()
        return decomposer
    }
    /**
     * Replace x=？ pattern to x=x
     */
    private replaceSingleWildcardToCharItself() {
        const db = this.db
        db.run(`
            update tempids
            set IDS_tokens = UCS
            where IDS_tokens = '？'
        `)
    }
    /**
     * Replace all subtractions into IDSs not containing subtractions.
     *
     * examples:
     * - replace 𠆱=⿰亻⊖斗丶 into 𠆱=⿰亻x and 斗=⿻x丶
     * - replace 㱐=⊖武㇂ into 武=⿻㱐㇂
     *
     * where x stands for a unique token
     */
    private reduceAllSubtractions() {
        function* invert(char: string, subtraction: string[]): Generator<[char: string, tokens: string[]]> {
            if (subtraction[0] !== "⊖") throw new RangeError("the first token of subtraction is not ⊖")
            if (nodeLength(subtraction, 1) !== 1) throw new Error("unimplemented")
            // char = ⊖ minuend subtrahend
            // ≡ minuend = ⿻ char subtrahend
            const minuend = subtraction[1]
            const subtrahend = subtraction.slice(2)
            if (nodeLength(subtrahend, 0) !== subtrahend.length) throw new RangeError("the subtrahend is not complete IDS")
            if (subtrahend.includes("⊖")) throw new Error("unimplemented")
            yield [minuend, ["⿻", char, ...subtrahend]]
        }
        function* process(char: string, tokens: string[]): Generator<[char: string, tokens: string[]]> {
            const i = tokens.indexOf("⊖")
            if (i < 0) {
                yield [char, tokens]
                return
            }
            if (i === 0) {
                yield* invert(char, tokens)
                return
            }
            const eigenToken = `&s-${tokens[i + 1]}-${encodeTokensToXmlName(tokens.slice(i + 2, i + 2 + nodeLength(tokens, i + 2)))};`
            const subtraction = tokens.splice(i, nodeLength(tokens, i), eigenToken)
            yield* process(char, tokens)
            yield* invert(eigenToken, subtraction)
        }
        const db = this.db
        const pairs: { UCS: string, source: string, IDS_tokens: string }[] = db.getAll(`select UCS, source, IDS_tokens from tempids where IDS_tokens glob '*⊖*'`)
        db.run(`delete from tempids where IDS_tokens glob '*⊖*'`)
        const insert = db.prepare<[UCS: string, source: string, IDS_tokens: string], {}>(`insert into tempids (UCS, source, IDS_tokens) values (?, ?, ?)`)
        for (const { UCS, source, IDS_tokens } of pairs) {
            for (const [char, tokens] of process(UCS, IDS_tokens.split(" "))) {
                insert.run([char, source, tokens.join(" ")])
            }
        }
    }
    private expand(token: string) {
        return this.zvar?.get(token) ?? [token]
    }
    private atomicMemo = new Set()
    private lookupIDS(char: string, source: string): string[] {
        if (char[0] === "&" ||
            char[0] === "{" ||
            idsOperatorRegExp.test(char)) {
            return [char]
        }
        const atomicKey = `${char}${source}`
        if (this.atomicMemo.has(atomicKey)) {
            return [char]
        }
        const alltokens = (this.lookupIDSStatement.getAll({ char, source })).map(row => row.IDS_tokens)
        if (alltokens.length === 1 && alltokens[0] === char) {
            this.atomicMemo.add(atomicKey)
            return alltokens
        }
        if (alltokens.length > 0) return alltokens
        const fallback = this.fallbackLookupIDS(char, source)
        if (fallback) return fallback
        this.atomicMemo.add(atomicKey)
        return [char]
    }
    private fallbackMemo = new Map()
    private fallbackLookupIDS(char: string, source: string): string[] | undefined {
        const fallbackKey = `${char}:${source}`
        if (this.fallbackMemo.has(fallbackKey)) {
            return this.fallbackMemo.get(fallbackKey)
        }
        const alltokens = this.lookupIDSStatement.getAll({ char, source: "*" }).map(row => row.IDS_tokens)
        if (alltokens.length === 1) {
            this.fallbackMemo.set(fallbackKey, alltokens)
            return alltokens
        }
        const sources = fallbackSourceOrder.filter(s => s !== source)
        for (const fallbackSource of sources) {
            const alltokens = (this.lookupIDSStatement.getAll({ char, source: fallbackSource })).map(row => row.IDS_tokens)
            if (alltokens.length > 0) {
                this.insertFallbackStatement.run({ char, source, fallback: fallbackSource })
                this.fallbackMemo.set(fallbackKey, alltokens)
                return alltokens
            }
        }
    }
    private *decompose(token: string, source: string): Generator<string[]> {
        const chars = this.expand(token)
        for (const char of chars) {
            const alltokens = this.lookupIDS(char, source)
            let unknownid = 0
            for (const tokens of alltokens) {
                yield tokens.split(/ /g).flatMap(token => {
                    if (token === "？") {
                        return `&c-${char}-${++unknownid};`
                    } else if (token === "⿻") {
                        // add a hidden argument to the overlaid operator
                        return ["&OL3;", `&ol-${char}-${++unknownid};`]
                    } else {
                        return token
                    }
                })
            }
        }
    }
    *decomposeAll(char: string, source: string): Generator<string[]> {
        for (const tokens of this.decompose(char, source)) {
            if (tokens.length === 1 && tokens[0] === char) {
                // atomic component (whose IDS is the character itself)
                yield tokens
            } else if (tokens[0] === '⊖') {
                // treat the char as an atomic component
                yield [char]
            } else {
                yield* this.decomposeTokens(tokens, source)
            }
        }
    }
    private *mapDecomposeAll(tokens: string[], source: string): Generator<() => Iterable<string[]>> {
        let i = 0
        while (i < tokens.length) {
            const token = tokens[i++]
            yield () => this.decomposeAll(token, source)
        }
    }
    *decomposeTokens(tokens: string[], source: string): Generator<string[]> {
        const allDecomposed = allCombinations(Array.from(this.mapDecomposeAll(tokens, source)))
        for (const decomposed of allDecomposed) {
            yield normalizeOverlaid(decomposed.flat())
        }
    }
    allCharSources(): { char: string, source: string }[] {
        const db = this.db
        return db.getAll(`select UCS as char, source from tempids_UCS_source`)
    }
    allFallbacks(): { char: string, source: string }[] {
        const a = []
        for (const k of this.fallbackMemo.keys()) {
            const [char, source] = k.split(":")
            a.push({ char, source })
        }
        return a
    }
}
