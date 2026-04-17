import type { Context } from "hono";
import type { MojidataApiDb } from "@mandel59/mojidata-api-core";
export declare function createMojidataHandler(db: MojidataApiDb): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    error: {
        message: string;
    };
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    query: {
        char: string;
        select: string[] | undefined;
    };
    results: any;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
