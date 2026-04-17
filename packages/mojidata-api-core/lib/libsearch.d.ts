import type { SqlExecutor } from "./sql-executor";
type QueryAndArgs = [string, string[]];
export declare function getQueryAndArgs(p: string, q: string): QueryAndArgs;
export declare function createLibSearch(getDb: () => Promise<SqlExecutor>): {
    filterChars: (chars: string[], ps: string[], qs: string[]) => Promise<string[]>;
    search: (ps: string[], qs: string[]) => Promise<string[]>;
};
export {};
