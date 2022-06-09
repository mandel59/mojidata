import path from "path"
import Database, { Statement } from "better-sqlite3"
import { tokenizeIDS } from "./ids-tokenizer"
import { query } from "./idsfind-query"

interface IDSFinderOptions {
    dbpath?: string
}

export class IDSFinder {
    private findStatement: Statement<[{ idslist: string }]>
    constructor(options: IDSFinderOptions = {}) {
        const dbpath = options.dbpath ?? require.resolve("../idsfind.db")
        const db = new Database(dbpath)
        this.findStatement = db.prepare<{ idslist: string }>(query).pluck()
    }
    *find(...idslist: string[]) {
        for (const result of this.findStatement.iterate({
            idslist: JSON.stringify(idslist.map(ids => tokenizeIDS(ids)))
        })) {
            yield result as string
        }
    }
}
