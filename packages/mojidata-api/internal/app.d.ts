import { Hono } from "hono";
import type { MojidataApiDb } from "./core";
export declare function createApp(db: MojidataApiDb): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
