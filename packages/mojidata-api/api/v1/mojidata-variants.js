"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMojidataVariantsHandler = createMojidataVariantsHandler;
const cast_1 = require("./_lib/cast");
const getApiHeaders_1 = require("./_lib/getApiHeaders");
const parse_char_1 = require("./_lib/parse-char");
function createMojidataVariantsHandler(db) {
    return async function mojidataVariantsHandler(c) {
        const headers = (0, getApiHeaders_1.getApiHeaders)();
        const charsRaw = (0, cast_1.castToStringArray)(c.req.queries("char") ?? []);
        if (charsRaw.length === 0) {
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ error: { message: "char is required" } }, 400);
        }
        const chars = [];
        for (const input of charsRaw) {
            if (typeof input !== "string")
                continue;
            const char = (0, parse_char_1.parseSingleChar)(input);
            if (!char) {
                headers.forEach(({ key, value }) => c.header(key, value));
                return c.json({ error: { message: "char must be a single character" } }, 400);
            }
            chars.push(char);
        }
        const results = await db.getMojidataVariantRels(chars);
        headers.forEach(({ key, value }) => c.header(key, value));
        return c.json({ query: { char: chars }, results });
    };
}
