export type NodeDbBackend = "sqljs" | "better-sqlite3";
export declare function createNodeDb({ backend, }?: {
    backend?: NodeDbBackend;
}): import("@mandel59/mojidata-api-core").MojidataApiDb;
export declare function createNodeApp(options?: {
    backend?: NodeDbBackend;
}): import("hono").Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
