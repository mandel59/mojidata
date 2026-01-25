import type { Database } from "sql.js";
import type { MojidataApiDb } from "./mojidata-api-db";
type DbProvider = () => Promise<Database>;
export declare function createSqlJsApiDb({ getMojidataDb, getIdsfindDb, }: {
    getMojidataDb: DbProvider;
    getIdsfindDb: DbProvider;
}): MojidataApiDb;
export {};
