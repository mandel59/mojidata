import Database from "better-sqlite3"
import path from "path"
import { query, makeQuery } from "./idsfind-query"
import { postaudit, tokenizeIdsList } from "./ids-finder-core"

interface IDSFinderOptions {
    dbpath?: string
    dbOptions?: Database.Options
}

function resolvePnpVirtualPath(filePath: string) {
    if (!path.isAbsolute(filePath)) {
        return filePath
    }
    try {
        // Yarn PnP can return virtual paths that native modules (sqlite) can't open.
        const pnp = require("pnpapi") as { resolveVirtual?: (p: string) => string | null }
        return pnp.resolveVirtual?.(filePath) ?? filePath
    } catch {
        return filePath
    }
}

export class IDSFinder {
    db: Database.Database;
    private findStatement: Database.Statement
    private getIDSTokensStatement: Database.Statement
    constructor(options: IDSFinderOptions = {}) {
        const dbpath = resolvePnpVirtualPath(options.dbpath ?? require.resolve("@mandel59/idsdb/idsfind.db"))
        const dbOptions = options.dbOptions ?? {}
        const db = new Database(dbpath, dbOptions)
        this.db = db;
        this.findStatement = db.prepare(query).pluck()
        this.getIDSTokensStatement = db.prepare(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`).pluck()
    }
    statements(): any[] {
        return [this.findStatement, this.getIDSTokensStatement]
    }
    close() {
        this.db.close()
    }
    *find(...idslist: string[]) {
        const tokenized = tokenizeIdsList(idslist)
        for (const result of this.findStatement.iterate({ idslist: JSON.stringify(tokenized.forQuery) } as any) as any) {
            if (postaudit(result as string, tokenized.forAudit, this.getIDSTokensForUcs)) {
                yield result as string
            }
        }
    }
    debugQuery(query: string, ...idslist: string[]) {
        const tokenized = tokenizeIdsList(idslist)
        return this.db.prepare(makeQuery(query)).all({ idslist: JSON.stringify(tokenized.forQuery) } as any);
    }
    private getIDSTokensForUcs = (ucs: string) => {
        return this.getIDSTokensStatement.all({ ucs } as any) as string[]
    }
}
