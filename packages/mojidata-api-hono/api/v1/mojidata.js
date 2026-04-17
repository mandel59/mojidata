"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMojidataHandler = createMojidataHandler;
const cast_1 = require("./_lib/cast");
const getApiHeaders_1 = require("./_lib/getApiHeaders");
const mojidata_query_1 = require("./_lib/mojidata-query");
function createMojidataHandler(db) {
    return async function mojidataHandler(c) {
        let char = c.req.query("char");
        let select = c.req.queries("select") ?? [];
        const headers = (0, getApiHeaders_1.getApiHeaders)();
        if (!char || typeof char !== "string") {
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ error: { message: "char is required" } }, 400);
        }
        if (typeof char === "string" && char.length > 1) {
            const m = /U\+?([0-9A-F]+)/i.exec(char);
            if (m) {
                char = String.fromCodePoint(parseInt(m[1], 16));
            }
        }
        if ([...char].length !== 1) {
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ error: { message: "char must be a single character" } }, 400);
        }
        select = (0, cast_1.castToStringArray)(select);
        if (select.some((s) => !mojidata_query_1.mojidataFieldNames.has(s))) {
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ error: { message: "invalid select", options: [...mojidata_query_1.mojidataFieldNames] } }, 400);
        }
        const resultsJson = await db.getMojidataJson(char, select);
        const results = typeof resultsJson === "string" ? JSON.parse(resultsJson) : null;
        headers.forEach(({ key, value }) => c.header(key, value));
        return c.json({
            query: { char, select: select.length > 0 ? select : undefined },
            results,
        });
    };
}
