import type BetterSqlite3Database from "better-sqlite3";
import type { SqlExecutor } from "./sql-executor";
export declare function createBetterSqlite3Executor(db: BetterSqlite3Database.Database): SqlExecutor;
