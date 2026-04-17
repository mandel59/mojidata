"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIvsListHandler = createIvsListHandler;
const getApiHeaders_1 = require("./_lib/getApiHeaders");
const parse_char_1 = require("./_lib/parse-char");
function createIvsListHandler(db) {
    return async function ivsListHandler(c) {
        const headers = (0, getApiHeaders_1.getApiHeaders)();
        const input = c.req.query("char");
        if (!input || typeof input !== "string") {
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ error: { message: "char is required" } }, 400);
        }
        const char = (0, parse_char_1.parseSingleChar)(input);
        if (!char) {
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ error: { message: "char must be a single character" } }, 400);
        }
        const results = await db.getIvsList(char);
        headers.forEach(({ key, value }) => c.header(key, value));
        return c.json({ query: { char }, results });
    };
}
