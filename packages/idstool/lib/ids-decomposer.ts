import Database from "better-sqlite3"
import { nodeLength, normalizeOverlaid, tokenArgs } from "./ids-operator"
import { tokenizeIDS } from "./ids-tokenizer"

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
    mojidb?: string
    idstable?: string
    unihanPrefix?: string
    dbpath?: string
    expandZVariants?: boolean
}

export class IDSDecomposer {
    private db: import("better-sqlite3").Database
    private lookupIDSStatement: import("better-sqlite3").Statement<{ char: string, source: string }>
    readonly expandZVariants: boolean
    private zvar?: Map<string, string[]>
    constructor(options: IDSDecomposerOptions = {}) {
        const mojidbpath = options.mojidb ?? require.resolve("@mandel59/mojidata/dist/moji.db")
        const idstable = options.idstable ?? "ids"
        const unihanPrefix = options.unihanPrefix ?? "unihan"
        const dbpath = options.dbpath ?? ":memory:"
        this.expandZVariants = options.expandZVariants ?? false
        const db = new Database(dbpath)
        const tokenize = (s: string) => tokenizeIDS(s).join(' ')
        db.function("tokenize", tokenize)
        db.table("regexp_substr_all", {
            parameters: ["string", "pattern"],
            columns: ["value"],
            rows: function* (...args: unknown[]) {
                const [string, pattern] = args
                if (typeof pattern !== "string") {
                    throw new TypeError("regexp_substr_all(string, pattern): pattern is not a string")
                }
                if (string === null) {
                    return
                }
                if (typeof string !== "string") {
                    throw new TypeError("regexp_substr_all(string, pattern): string is not a string")
                }
                const re = new RegExp(pattern, "gu")
                let m
                while (m = re.exec(string)) {
                    yield [m[0]]
                }
            }
        })
        db.prepare(`attach database ? as moji`).run(mojidbpath)
        db.exec(`drop table if exists tempids`)
        db.exec(`create table tempids (UCS, source, IDS_tokens)`)
        db.exec(`create index tempids_UCS on tempids (UCS)`)
        db.exec(`insert into tempids select UCS, value as source, tokenize(IDS) as IDS_tokens FROM moji.${idstable} join regexp_substr_all(source, 'UCS2003|\\w')`)
        if (this.expandZVariants) {
            this.zvar = new Map(
                db.prepare(`select UCS, value FROM moji.${unihanPrefix}_kZVariant`).all()
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
            `select distinct IDS_tokens from tempids
            where UCS = $char and source glob $source`).pluck()
        this.removeRedundantEntries()
        this.reduceAllSubtractions()
    }
    /**
     * Remove redundant entries.
     *
     * The following patterns are redundant.
     * - x=x
     * - x=？
     */
    private removeRedundantEntries() {
        this.db.prepare(`
            delete from tempids
            where UCS = IDS_tokens or IDS_tokens = '？'
        `).run()
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
        const pairs: {
            UCS: string,
            source: string,
            IDS_tokens: string,
        }[] = this.db.prepare(`select UCS, source, IDS_tokens from tempids where IDS_tokens glob '*⊖*'`).all()
        this.db.prepare(`delete from tempids where IDS_tokens glob '*⊖*'`).run()
        const insert = this.db.prepare<[UCS: string, source: string, IDS_tokens: string]>(`insert into tempids (UCS, source, IDS_tokens) values (?, ?, ?)`)
        for (const { UCS, source, IDS_tokens } of pairs) {
            for (const [char, tokens] of process(UCS, IDS_tokens.split(" "))) {
                insert.run(char, source, tokens.join(" "))
            }
        }
    }
    private expand(token: string) {
        return this.zvar?.get(token) ?? [token]
    }
    private normalize(token: string) {
        return token
    }
    private lookupIDS(char: string, source: string): string[] {
        const alltokens = this.lookupIDSStatement.all({ char, source }) as string[]
        if (alltokens.length > 0) return alltokens
        const sources = ["G", "T", "H", "K", "J", "B", "U", "*"].filter(s => s !== source)
        for (const source of sources) {
            const alltokens = this.lookupIDSStatement.all({ char, source }) as string[]
            if (alltokens.length > 0) return alltokens
        }
        return [char]
    }
    private *decompose(token: string, source: string): Generator<string[]> {
        const chars = this.expand(token)
        for (const char of chars) {
            const alltokens = this.lookupIDS(char, source)
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
    *decomposeAll(char: string, source: string): Generator<string[]> {
        for (const tokens of this.decompose(char, source)) {
            if (tokens.length === 1 && tokens[0] === char) {
                // atomic component (whose IDS is the character itself)
                yield tokens
            } else if (tokens[0] === '〾' || tokens[0] === '⊖') {
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
            if (token === "〾") {
                const quotedTokens: string[] = []
                quotedTokens.push(token)
                let argCount = 1
                while (argCount > 0) {
                    const token = tokens[i++]
                    argCount += (tokenArgs[token] ?? 0) - 1
                    quotedTokens.push(token)
                }
                const tokensList = [quotedTokens]
                yield () => tokensList
                continue
            }
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
        return this.db.prepare(`select distinct UCS as char, source from tempids`).all()
    }
}
