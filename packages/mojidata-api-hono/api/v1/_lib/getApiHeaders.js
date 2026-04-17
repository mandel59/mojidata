"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiHeaders = getApiHeaders;
const jsonContentType = 'application/json; charset=utf-8';
const headers = [
    { key: 'Content-Type', value: jsonContentType },
    { key: 'Access-Control-Allow-Origin', value: '*' },
    { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS' },
];
function getApiHeaders() {
    return headers;
}
