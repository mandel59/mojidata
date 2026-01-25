import type { Database } from "sql.js";
export type DatabaseOpener = () => Promise<Database>;
export declare function createMojidataDbProvider(openDatabase: DatabaseOpener): () => Promise<Database>;
