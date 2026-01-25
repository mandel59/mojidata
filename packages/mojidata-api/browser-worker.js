"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mojidata_api_db_sqljs_1 = require("./api/v1/_lib/mojidata-api-db-sqljs");
const mojidata_db_1 = require("./api/v1/_lib/mojidata-db");
const promise_cache_1 = require("./api/v1/_lib/promise-cache");
const sqljs_web_1 = require("./api/v1/_lib/sqljs-web");
let api;
function serializeError(error) {
    if (error instanceof Error) {
        return { message: error.message, stack: error.stack };
    }
    return { message: String(error) };
}
async function initWorker(init) {
    const getMojidataDb = (0, mojidata_db_1.createMojidataDbProvider)(() => (0, sqljs_web_1.openDatabaseFromUrl)(init.mojidataDbUrl, init.sqlWasmUrl));
    const getIdsfindDb = (0, promise_cache_1.createCachedPromise)(() => (0, sqljs_web_1.openDatabaseFromUrl)(init.idsfindDbUrl, init.sqlWasmUrl));
    api = (0, mojidata_api_db_sqljs_1.createSqlJsApiDb)({ getMojidataDb, getIdsfindDb });
}
self.addEventListener("message", async (ev) => {
    const req = ev.data;
    const post = (res) => self.postMessage(res);
    try {
        if (req.type === "init") {
            await initWorker(req.init);
            post({ id: req.id, ok: true, result: null });
            return;
        }
        if (!api) {
            throw new Error("Worker is not initialized; call init first.");
        }
        const { method, args } = req.call;
        const result = await api[method](...args);
        post({ id: req.id, ok: true, result });
    }
    catch (error) {
        post({ id: req.id, ok: false, error: serializeError(error) });
    }
});
