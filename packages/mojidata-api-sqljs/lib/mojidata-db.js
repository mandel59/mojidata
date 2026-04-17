"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installMojidataSqlFunctions = installMojidataSqlFunctions;
exports.createMojidataDbProvider = createMojidataDbProvider;
const sqljs_executor_1 = require("./sqljs-executor");
function regexpAllJson(input, pattern) {
    const string = String(input ?? "");
    const re = new RegExp(String(pattern), "gu");
    const out = [];
    let match;
    while ((match = re.exec(string))) {
        out.push({
            substr: match[0],
            groups: match.groups ?? match.slice(1),
        });
    }
    return JSON.stringify(out);
}
function installMojidataSqlFunctions(registerFunction) {
    registerFunction("regexp_all", regexpAllJson);
    registerFunction("parse_int", ((s, base) => {
        const i = parseInt(s, base);
        if (!Number.isSafeInteger(i)) {
            return null;
        }
        return i;
    }));
    registerFunction("regexp", ((pattern, s) => {
        return new RegExp(pattern, "u").test(s) ? 1 : 0;
    }));
}
async function initDb(db) {
    installMojidataSqlFunctions((name, fn) => {
        db.create_function(name, fn);
    });
}
function createMojidataDbProvider(openDatabase) {
    let dbPromise;
    return function getMojidataDb() {
        dbPromise ?? (dbPromise = openDatabase().then(async (db) => {
            await initDb(db);
            return (0, sqljs_executor_1.createSqlJsExecutor)(db);
        }));
        return dbPromise;
    };
}
