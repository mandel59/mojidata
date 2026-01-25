import { Hono } from "hono";
import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db";
export declare function createApp(db: MojidataApiDb): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
