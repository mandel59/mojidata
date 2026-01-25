import type { Database } from "sql.js";
export declare function getQueryAndArgs(p: string, q: string): [string, string[]];
export declare function createLibSearch(getDb: () => Promise<Database>): {
    filterChars: (chars: string[], ps: string[], qs: string[]) => Promise<string[]>;
    search: (ps: string[], qs: string[]) => Promise<string[]>;
};
