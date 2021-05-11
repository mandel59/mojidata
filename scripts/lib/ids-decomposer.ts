import Database from "better-sqlite3"
import { transactionSync } from "./dbutils"
import { tokenizeIDS } from "./ids-tokenizer"

function* allCombinations<T>(list: Generator<T>[]): Generator<T[]> {
    if (list.length === 0) {
        return
    }
    if (list.length === 1) {
        for (const item of list[0]) {
            yield [item]
        }
        return
    }
    for (const restItems of allCombinations(list.slice(1))) {
        for (const item of list[0]) {
            yield [item, ...restItems]
        }
    }
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
            where
                UCS = $char
                and IDS_tokens not glob '*？*'`).pluck()
    }
    *decompose(char: string): Generator<string[]> {
        const alltokens = this.lookupIDSStatement.all({ char }) as string[]
        if (alltokens.length === 0) {
            yield [char]
            return
        }
        for (const tokens of alltokens) {
            yield tokens.split(/ /g)
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
    *decomposeTokens(tokens: string[]): Generator<string[]> {
        const allDecomposed = allCombinations(
            tokens.map(char => this.decomposeAll(char)))
        for (const decomposed of allDecomposed) {
            yield decomposed.flat()
        }
    }
    createDecomposedTable(db: import("better-sqlite3").Database, table: string) {
        db.exec(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY, UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL)`)
        const insert = db.prepare<{ id: number | null, ucs: string, tokens: string }>(`INSERT INTO ${table} VALUES ($id, $ucs, $tokens)`)
        transactionSync(db, () => {
            for (const id of this.db.prepare<[]>(`SELECT DISTINCT unicode(UCS) as id FROM tempids ORDER BY id`).pluck().iterate()) {
                const ucs = String.fromCodePoint(id)
                const tokens = Array.from(this.decomposeAll(ucs)).flat().join(' ')
                insert.run({ id, ucs, tokens })
            }
        })
    }
}
