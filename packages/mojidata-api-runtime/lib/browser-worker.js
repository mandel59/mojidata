"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mojidata_api_core_1 = require("@mandel59/mojidata-api-core");
const mojidata_api_sqljs_1 = require("@mandel59/mojidata-api-sqljs");
const promise_cache_1 = require("./promise-cache");
let api;
function serializeError(error) {
    if (error instanceof Error) {
        return { message: error.message, stack: error.stack };
    }
    return { message: String(error) };
}
async function initWorker(init) {
    const getMojidataDb = (0, mojidata_api_sqljs_1.createMojidataDbProvider)(() => (0, mojidata_api_sqljs_1.openDatabaseFromUrl)(init.mojidataDbUrl, init.sqlWasmUrl));
    const getIdsfindDb = (0, promise_cache_1.createCachedPromise)(async () => (0, mojidata_api_sqljs_1.createSqlJsExecutor)(await (0, mojidata_api_sqljs_1.openDatabaseFromUrl)(init.idsfindDbUrl, init.sqlWasmUrl)));
    api = (0, mojidata_api_core_1.createSqlApiDb)({ getMojidataDb, getIdsfindDb });
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
