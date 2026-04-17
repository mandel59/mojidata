import type { SqlExecutor } from "@mandel59/mojidata-api-core";
import type { Database } from "sql.js";
export type DatabaseOpener = () => Promise<Database>;
export declare function installMojidataSqlFunctions(registerFunction: (name: string, fn: (...args: never[]) => unknown) => void): void;
export declare function createMojidataDbProvider(openDatabase: DatabaseOpener): () => Promise<SqlExecutor>;
