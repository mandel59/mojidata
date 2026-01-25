import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db";
export declare function createNodeDb(): MojidataApiDb;
export declare function createNodeApp(): import("hono").Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
