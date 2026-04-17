"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSqlJsExecutor = createSqlJsExecutor;
function bindParams(stmt, params) {
    if (params === undefined) {
        return;
    }
    stmt.bind(params);
}
function createSqlJsExecutor(db) {
    return {
        async query(sql, params) {
            const stmt = db.prepare(sql);
            try {
                bindParams(stmt, params);
                const out = [];
                while (stmt.step()) {
                    out.push(stmt.getAsObject());
                }
                return out;
            }
            finally {
                stmt.free();
            }
        },
        async queryOne(sql, params) {
            const stmt = db.prepare(sql);
            try {
                bindParams(stmt, params);
                if (!stmt.step()) {
                    return null;
                }
                return stmt.getAsObject();
            }
            finally {
                stmt.free();
            }
        },
    };
}
