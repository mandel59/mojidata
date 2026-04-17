import type { SqlExecutor } from "./sql-executor";
export declare function createIdsfind(getDb: () => Promise<SqlExecutor>): (idslist: string[]) => Promise<string[]>;
