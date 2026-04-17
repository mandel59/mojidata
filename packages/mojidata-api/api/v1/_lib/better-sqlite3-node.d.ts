import type { SqlExecutor } from "./sql-executor";
export declare function createBetterSqlite3MojidataDbProvider(path: string): () => Promise<SqlExecutor>;
export declare function createBetterSqlite3ExecutorProvider(path: string): () => Promise<SqlExecutor>;
