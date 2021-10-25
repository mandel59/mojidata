import Database from "better-sqlite3"
import { nodeLength, tokenArgs } from "./ids-operator"
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

export type IDSDecomposerOptions = {
    expandZVariants?: boolean
}

export class IDSDecomposer {
    private db: import("better-sqlite3").Database
    private lookupIDSStatement: import("better-sqlite3").Statement<{ char: string }>
    readonly expandZVariants: boolean
    private zvar?: Map<string, string[]>
    constructor(dbpath: string, options: IDSDecomposerOptions = {}) {
        this.expandZVariants = options.expandZVariants ?? false
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
        function* process(char: string, tokens: string[], unknownid = 0): Generator<[char: string, tokens: string[]]> {
            const i = tokens.indexOf("⊖")
            if (i < 0) {
                yield [char, tokens]
                return
            }
            if (i === 0) {
                yield* invert(char, tokens)
                return
            }
            const eigenToken = `&s-${char}-${++unknownid};`
            const subtraction = tokens.splice(i, nodeLength(tokens, i), eigenToken)
            yield* process(char, tokens, unknownid)
            yield* invert(eigenToken, subtraction)
        }
        const pairs: {
            UCS: string,
            IDS_tokens: string,
        }[] = this.db.prepare(`select UCS, IDS_tokens from tempids where IDS_tokens glob '*⊖*'`).all()
        this.db.prepare(`delete from tempids where IDS_tokens glob '*⊖*'`).run()
        const insert = this.db.prepare<[UCS: string, IDS_tokens: string]>(`insert into tempids (UCS, IDS_tokens) values (?, ?)`)
        for (const { UCS, IDS_tokens } of pairs) {
            for (const [char, tokens] of process(UCS, IDS_tokens.split(" "))) {
                insert.run(char, tokens.join(" "))
            }
        }
    }
    private expand(token: string) {
        return this.zvar?.get(token) ?? [token]
    }
    private normalize(token: string) {
        return token
    }
    private *decompose(token: string): Generator<string[]> {
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
            if (tokens.length === 1 && tokens[0] === char) {
                // atomic component (whose IDS is the character itself)
                yield tokens
            } else if (tokens[0] === '〾' || tokens[0] === '⊖') {
                // treat the char as an atomic component
                yield [char]
            } else {
                yield* this.decomposeTokens(tokens)
            }
        }
    }
    private *mapDecomposeAll(tokens: string[]): Generator<() => Iterable<string[]>> {
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
