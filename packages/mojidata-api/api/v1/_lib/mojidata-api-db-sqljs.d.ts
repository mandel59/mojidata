import type { MojidataApiDb } from "./mojidata-api-db";
import type { SqlExecutor } from "./sql-executor";
type DbProvider = () => Promise<SqlExecutor>;
export declare function createSqlJsApiDb({ getMojidataDb, getIdsfindDb, }: {
    getMojidataDb: DbProvider;
    getIdsfindDb: DbProvider;
}): MojidataApiDb;
export {};
