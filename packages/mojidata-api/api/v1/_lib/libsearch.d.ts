import type { Database } from "sql.js";
type QueryAndArgs = [string, string[]];
export declare function getQueryAndArgs(p: string, q: string): QueryAndArgs;
export declare function createLibSearch(getDb: () => Promise<Database>): {
    filterChars: (chars: string[], ps: string[], qs: string[]) => Promise<string[]>;
    search: (ps: string[], qs: string[]) => Promise<string[]>;
};
export {};
