"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.castToStringArray = castToStringArray;
function castToStringArray(x) {
    if (x == null) {
        return [];
    }
    if (typeof x === 'string') {
        return [x];
    }
    return x;
}
