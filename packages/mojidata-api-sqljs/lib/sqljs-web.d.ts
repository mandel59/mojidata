import type { Database, SqlJsStatic } from "sql.js";
export declare function getSqlJsWeb(wasmUrl: string): Promise<SqlJsStatic>;
export declare function openDatabaseFromUrl(dbUrl: string, wasmUrl: string): Promise<Database>;
