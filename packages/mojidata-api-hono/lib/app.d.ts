import { Hono } from "hono";
import type { MojidataApiDb } from "@mandel59/mojidata-api-core";
export declare function createApp(db: MojidataApiDb): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
