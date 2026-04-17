import type { MojidataApiDb } from "@mandel59/mojidata-api-core";
import type { WorkerInit } from "./worker-protocol";
export declare function createMojidataApiWorkerClient(worker: Worker, init: WorkerInit): MojidataApiDb & {
    ready: Promise<void>;
    terminate: () => void;
};
