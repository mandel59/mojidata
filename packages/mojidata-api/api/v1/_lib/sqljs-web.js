"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSqlJsWeb = getSqlJsWeb;
exports.openDatabaseFromUrl = openDatabaseFromUrl;
const sql_js_1 = __importDefault(require("sql.js"));
const sqlJsByWasmUrl = new Map();
function getSqlJsWeb(wasmUrl) {
    const key = wasmUrl || "sql-wasm.wasm";
    const existing = sqlJsByWasmUrl.get(key);
    if (existing)
        return existing;
    const created = (0, sql_js_1.default)({
        locateFile: () => key,
    });
    sqlJsByWasmUrl.set(key, created);
    return created;
}
async function openDatabaseFromUrl(dbUrl, wasmUrl) {
    const SQL = await getSqlJsWeb(wasmUrl);
    const res = await fetch(dbUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch DB: ${dbUrl} (${res.status} ${res.statusText})`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return new SQL.Database(bytes);
}
