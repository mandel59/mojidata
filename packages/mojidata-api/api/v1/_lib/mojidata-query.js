"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mojidataFieldNames = void 0;
exports.buildMojidataSelectQuery = buildMojidataSelectQuery;
const query_expressions_1 = require("./query-expressions");
exports.mojidataFieldNames = new Set(query_expressions_1.queryExpressions.map(([key, _value]) => key));
function buildMojidataSelectQuery(selection) {
    const selected = new Set(selection);
    const a = [];
    const selectAll = selected.size === 0;
    for (const [name, e] of query_expressions_1.queryExpressions) {
        if (selectAll || selected.has(name)) {
            a.push(`'${name}', ${e}`);
        }
    }
    return `SELECT json_object(${a.join(",")}) AS vs`;
}
