import { createNodeDb } from "@mandel59/mojidata-api-runtime"

export class IDSFinder {
    private db = createNodeDb()
    close() {
        // no-op (sql.js db is cached internally)
    }
    async find(...idslist: string[]) {
        return await this.db.idsfind(idslist)
    }
    async debugQuery(query: string, ...idslist: string[]) {
        return await this.db.idsfindDebugQuery(query, idslist)
    }
}
