import type { SqlExecutor } from "./sql-executor";
export declare function getQueryAndArgs(p: string, q: string): [string, string[]];
export declare function createLibSearch(getDb: () => Promise<SqlExecutor>): {
    filterChars: (chars: string[], ps: string[], qs: string[]) => Promise<string[]>;
    search: (ps: string[], qs: string[]) => Promise<string[]>;
};
