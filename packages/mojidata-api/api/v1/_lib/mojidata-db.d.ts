import type { Database } from "sql.js";
import type { SqlExecutor } from "./sql-executor";
export type DatabaseOpener = () => Promise<Database>;
export declare function createMojidataDbProvider(openDatabase: DatabaseOpener): () => Promise<SqlExecutor>;
