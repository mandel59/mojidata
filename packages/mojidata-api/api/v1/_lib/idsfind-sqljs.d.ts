import type { Database } from "sql.js";
export declare function createIdsfind(getDb: () => Promise<Database>): (idslist: string[]) => Promise<string[]>;
