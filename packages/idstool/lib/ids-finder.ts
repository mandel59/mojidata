import path from "path"
import Database, { Statement } from "better-sqlite3"
import { tokenizeIDS } from "./ids-tokenizer"
import { query, makeQuery } from "./idsfind-query"
import { expandOverlaid, nodeLength } from "./ids-operator"

interface IDSFinderOptions {
    dbpath?: string
}

function tokenizeIdsList(idslist: string[]) {
    const idslistTokenized = idslist.map(tokenizeIDS).map(expandOverlaid)
    /** ids list without variable constraints. variables are replaced into placeholder token ？ */
    const idslistWithoutVC = idslistTokenized.map(x => x.map(y => y.map(z => /^[a-zａ-ｚ]$/.test(z) ? "？" : z)))
    return {
        forQuery: idslistWithoutVC,
        forAudit: idslistTokenized,
    }
}

export class IDSFinder {
    private db: import("better-sqlite3").Database;
    private findStatement: Statement<[{ idslist: string }]>
    private getIDSTokensStatement: Statement<[{ ucs: string }]>
    constructor(options: IDSFinderOptions = {}) {
        const dbpath = options.dbpath ?? require.resolve("../idsfind.db")
        const db = new Database(dbpath)
        this.db = db;
        this.findStatement = db.prepare<{ idslist: string }>(query).pluck()
        this.getIDSTokensStatement = db.prepare<{ ucs: string }>(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`).pluck()
    }
    *find(...idslist: string[]) {
        const tokenized = tokenizeIdsList(idslist)
        for (const result of this.findStatement.iterate({ idslist: JSON.stringify(tokenized.forQuery) })) {
            if (this.postaudit(result, tokenized.forAudit)) {
                yield result as string
            }
        }
    }
    debugQuery(query: string, ...idslist: string[]) {
        const tokenized = tokenizeIdsList(idslist)
        return this.db.prepare(makeQuery(query)).all({ idslist: JSON.stringify(tokenized.forQuery) });
    }
    private idsmatch(tokens: string[], pattern: string[]) {
        const matchFrom = (i: number) => {
            const vars = new Map<string, string[]>()
            let k = i
            loop: for (let j = 0; j < pattern.length; j++) {
                if (pattern[j] === '§') {
                    if (k === 0 || k === tokens.length) {
                        continue loop
                    }
                } else if (pattern[j] === '？') {
                    k += nodeLength(tokens, k)
                    continue loop
                } else if (/^[a-zａ-ｚ]$/.test(pattern[j])) {
                    const varname = pattern[j]
                    const l = nodeLength(tokens, k)
                    const slice = vars.get(varname)
                    if (slice) {
                        if (!slice.every((t, offset) => t === tokens[k + offset])) {
                            return false
                        }
                    } else {
                        vars.set(varname, tokens.slice(k, k + l))
                    }
                    k += l
                    continue loop
                }
                const ts = this.getIDSTokensStatement.all({ ucs: pattern[j] })
                if (ts.length === 0 && pattern[j] === tokens[k]) {
                    k++
                    continue loop
                }
                for (const t of ts) {
                    const l = t.split(' ').length
                    if (tokens.slice(k, k + l).join(' ') === t) {
                        k += l
                        continue loop
                    }
                }
                return false
            }
            if (k > tokens.length) {
                return false
            }
            return true
        }
        for (let i = 0; i < tokens.length; i++) {
            if (matchFrom(i)) {
                return true
            }
        }
        return false
    }
    private postaudit(result: string, idslist: string[][][]) {
        for (const IDS_tokens of this.getIDSTokensStatement.all({ ucs: result })) {
            const tokens = IDS_tokens.split(' ')
            if (idslist.every(patterns => {
                return patterns.some(pattern => this.idsmatch(tokens, pattern))
            })) {
                return true
            }
        }
        return false
    }
}
