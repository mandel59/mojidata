import type { Context } from "hono";
import type { MojidataApiDb } from "./_lib/mojidata-api-db";
export declare function createIvsListHandler(db: MojidataApiDb): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    error: {
        message: string;
    };
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    query: {
        char: string;
    };
    results: {
        IVS: string;
        unicode: string;
        collection: string;
        code: string;
    }[];
}, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
