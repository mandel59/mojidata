"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBetterSqlite3Executor = createBetterSqlite3Executor;
function normalizeNamedParams(params) {
    return Object.fromEntries(Object.entries(params).map(([key, value]) => [key.replace(/^[:@$]/u, ""), value]));
}
function applyParams(stmt, method, params) {
    if (params === undefined) {
        return stmt[method]();
    }
    if (Array.isArray(params)) {
        return stmt[method](...params);
    }
    return stmt[method](normalizeNamedParams(params));
}
function createBetterSqlite3Executor(db) {
    return {
        async query(sql, params) {
            const stmt = db.prepare(sql);
            return applyParams(stmt, "all", params) ?? [];
        },
        async queryOne(sql, params) {
            const stmt = db.prepare(sql);
            return applyParams(stmt, "get", params) ?? null;
        },
    };
}
