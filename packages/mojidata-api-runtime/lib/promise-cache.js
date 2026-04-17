"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCachedPromise = createCachedPromise;
function createCachedPromise(factory) {
    let promise;
    return () => {
        promise ?? (promise = factory());
        return promise;
    };
}
