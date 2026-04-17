import type { Database } from "sql.js";
import type { SqlExecutor } from "./sql-executor";
export declare function createSqlJsExecutor(db: Database): SqlExecutor;
