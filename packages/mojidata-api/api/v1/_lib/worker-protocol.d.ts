import type { MojidataApiDb } from "./mojidata-api-db";
export type WorkerInit = {
    sqlWasmUrl: string;
    mojidataDbUrl: string;
    idsfindDbUrl: string;
};
export type WorkerCall = {
    [K in keyof MojidataApiDb]: {
        method: K;
        args: Parameters<MojidataApiDb[K]>;
    };
}[keyof MojidataApiDb];
export type WorkerRequest = {
    id: number;
    type: "init";
    init: WorkerInit;
} | {
    id: number;
    type: "call";
    call: WorkerCall;
};
export type WorkerResponse = {
    id: number;
    ok: true;
    result: any;
} | {
    id: number;
    ok: false;
    error: {
        message: string;
        stack?: string;
    };
};
