import type { MojidataApiDb } from "../core";
import type { WorkerInit } from "../../api/v1/_lib/worker-protocol";
export declare function createMojidataApiWorkerClient(worker: Worker, init: WorkerInit): MojidataApiDb & {
    ready: Promise<void>;
    terminate: () => void;
};
