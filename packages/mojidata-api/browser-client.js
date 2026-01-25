"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMojidataApiWorkerClient = createMojidataApiWorkerClient;
function createMojidataApiWorkerClient(worker, init) {
    let nextId = 1;
    const pending = new Map();
    worker.addEventListener("message", (ev) => {
        const msg = ev.data;
        const handler = pending.get(msg.id);
        if (!handler)
            return;
        pending.delete(msg.id);
        if (msg.ok) {
            handler.resolve(msg.result);
            return;
        }
        const err = new Error(msg.error.message);
        if (msg.error.stack)
            err.stack = msg.error.stack;
        handler.reject(err);
    });
    const callRaw = (req) => {
        const id = req.id;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            worker.postMessage(req);
        });
    };
    const initId = nextId++;
    const ready = callRaw({ id: initId, type: "init", init });
    const call = async (call) => {
        await ready;
        const id = nextId++;
        return await callRaw({ id, type: "call", call });
    };
    return {
        ready,
        terminate: () => worker.terminate(),
        getMojidataJson: (char, select) => call({ method: "getMojidataJson", args: [char, select] }),
        getIvsList: (char) => call({ method: "getIvsList", args: [char] }),
        getMojidataVariantRels: (chars) => call({
            method: "getMojidataVariantRels",
            args: [chars],
        }),
        idsfind: (idslist) => call({ method: "idsfind", args: [idslist] }),
        idsfindDebugQuery: (queryBody, idslist) => call({
            method: "idsfindDebugQuery",
            args: [queryBody, idslist],
        }),
        search: (ps, qs) => call({ method: "search", args: [ps, qs] }),
        filterChars: (chars, ps, qs) => call({ method: "filterChars", args: [chars, ps, qs] }),
    };
}
