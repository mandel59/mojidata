import type { SqlExecutor } from "./sql-executor";
import type { Database } from "sql.js";
export type DatabaseOpener = () => Promise<Database>;
export declare function installMojidataSqlFunctions(registerFunction: (name: string, fn: (...args: never[]) => unknown) => void): void;
export declare function createMojidataDbProvider(openDatabase: DatabaseOpener): () => Promise<SqlExecutor>;
