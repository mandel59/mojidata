import type { Database, SqlJsStatic } from "sql.js";
export declare function getSqlJsNode(): Promise<SqlJsStatic>;
export declare function openDatabaseFromFile(filePath: string): Promise<Database>;
