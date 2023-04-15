import { tokenizeIDS } from "./ids-tokenizer"
import { query, makeQuery } from "./idsfind-query"
import { expandOverlaid, nodeLength } from "./ids-operator"
import { SQLite3Database, SQLite3Statement } from "./interface/sqlite3"

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
    private db: SQLite3Database;
    private findStatement!: SQLite3Statement<{ idslist: string }, { UCS: string }>
    private getIDSTokensStatement!: SQLite3Statement<{ ucs: string }, { IDS_tokens: string }>
    private constructor(db: SQLite3Database) {
        this.db = db;
    }
    static open(db: SQLite3Database) {
        const finder = new IDSFinder(db)
        finder.findStatement = db.prepare<{ idslist: string }, { UCS: string }>(query)
        finder.getIDSTokensStatement = db.prepare<
            { ucs: string },
            { IDS_tokens: string }
        >(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`)
        return finder
    }
    *find(...idslist: string[]) {
        const { forQuery, forAudit } = tokenizeIdsList(idslist)
        for (const result of this.findStatement.iterate({ idslist: JSON.stringify(forQuery) })) {
            const UCS = result.UCS
            if (this.postaudit(UCS, forAudit)) {
                yield UCS
            }
        }
    }
    debugQuery(query: string, ...idslist: string[]) {
        const tokenized = tokenizeIdsList(idslist)
        const debugStatement = this.db.prepare<{ idslist: string }, Record<string, unknown>>(makeQuery(query))
        return debugStatement.getAll({ idslist: JSON.stringify(tokenized.forQuery) });
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
                const ts = this.getIDSTokensStatement.getAll({ ucs: pattern[j] })
                if (ts.length === 0 && pattern[j] === tokens[k]) {
                    k++
                    continue loop
                }
                for (const { IDS_tokens: t } of ts) {
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
        for (const { IDS_tokens } of this.getIDSTokensStatement.iterate({ ucs: result })) {
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
