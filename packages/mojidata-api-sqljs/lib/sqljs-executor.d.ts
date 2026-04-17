import type { SqlExecutor } from "@mandel59/mojidata-api-core";
import type { Database } from "sql.js";
export declare function createSqlJsExecutor(db: Database): SqlExecutor;
