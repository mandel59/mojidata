import type { SqlExecutor } from "@mandel59/mojidata-api-core";
export declare function createBetterSqlite3MojidataDbProvider(path: string): () => Promise<SqlExecutor>;
export declare function createBetterSqlite3ExecutorProvider(path: string): () => Promise<SqlExecutor>;
