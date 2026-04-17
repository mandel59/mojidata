import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db";
export type NodeDbBackend = "sqljs" | "better-sqlite3";
export declare function createNodeDb({ backend, }?: {
    backend?: NodeDbBackend;
}): MojidataApiDb;
export declare function createNodeApp(options?: {
    backend?: NodeDbBackend;
}): import("hono").Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
