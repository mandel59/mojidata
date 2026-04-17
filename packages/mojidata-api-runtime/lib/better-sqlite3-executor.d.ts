import type BetterSqlite3Database from "better-sqlite3";
import type { SqlExecutor } from "@mandel59/mojidata-api-core";
export declare function createBetterSqlite3Executor(db: BetterSqlite3Database.Database): SqlExecutor;
