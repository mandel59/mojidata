import type { Context } from "hono";
import type { MojidataApiDb } from "@mandel59/mojidata-api-core";
export declare function createIdsfindHandler(db: MojidataApiDb): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    error: {
        message: string;
    };
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    total?: number | undefined;
    done?: boolean | undefined;
    query: {
        p: string[];
        q: string[];
        limit: number | undefined;
        offset: number | undefined;
        all_results: true | undefined;
    };
    results: string[];
}, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
    total?: number | undefined;
    done?: boolean | undefined;
    query: {
        ids: string[];
        whole: string[];
        p: string[] | undefined;
        q: string[] | undefined;
        limit: number | undefined;
        offset: number | undefined;
        all_results: true | undefined;
    };
    results: string[];
}, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
