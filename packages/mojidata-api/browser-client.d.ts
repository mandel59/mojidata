import type { MojidataApiDb } from "./api/v1/_lib/mojidata-api-db";
import type { WorkerInit } from "./api/v1/_lib/worker-protocol";
export declare function createMojidataApiWorkerClient(worker: Worker, init: WorkerInit): MojidataApiDb & {
    ready: Promise<void>;
    terminate: () => void;
};
