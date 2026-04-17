import type { Context } from "hono";
import type { MojidataApiDb } from "@mandel59/mojidata-api-core";
export declare function createMojidataVariantsHandler(db: MojidataApiDb): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    error: {
        message: string;
    };
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    query: {
        char: string[];
    };
    results: {
        c1: string;
        c2: string;
        f: number;
        r: string;
    }[];
}, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
