import path from "path"
import Database, { Statement } from "better-sqlite3"
import { tokenizeIDS } from "./ids-tokenizer"
import { query } from "./idsfind-query"
import { expandOverlaid, nodeLength } from "./ids-operator"

interface IDSFinderOptions {
    dbpath?: string
}

export class IDSFinder {
    private findStatement: Statement<[{ idslist: string }]>
    private getIDSTokensStatement: Statement<[{ ucs: string }]>
    constructor(options: IDSFinderOptions = {}) {
        const dbpath = options.dbpath ?? require.resolve("../idsfind.db")
        const db = new Database(dbpath)
        this.findStatement = db.prepare<{ idslist: string }>(query).pluck()
        this.getIDSTokensStatement = db.prepare<{ ucs: string }>(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`).pluck()
    }
    *find(...idslist: string[]) {
        const idslistTokenized = idslist.map(ids => [...expandOverlaid(tokenizeIDS(ids))])
        for (const result of this.findStatement.iterate({ idslist: JSON.stringify(idslistTokenized) })) {
            if (this.postaudit(result, idslistTokenized)) {
                yield result as string
            }
        }
    }
    private idsmatch(tokens: string[], pattern: string[]) {
        const matchFrom = (i: number) => {
            let k = i
            loop: for (let j = 0; j < pattern.length; j++) {
                if (pattern[j] === '§') {
                    if (k === 0 || k === tokens.length) {
                        continue loop
                    }
                } else if (pattern[j] === '？') {
                    k += nodeLength(tokens, k)
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
