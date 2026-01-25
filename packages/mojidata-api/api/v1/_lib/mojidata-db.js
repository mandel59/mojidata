"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMojidataDbProvider = createMojidataDbProvider;
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
async function initDb(db) {
    // scalar function returning JSON array of matches (see query-expressions.ts)
    db.create_function("regexp_all", regexpAllJson);
    db.create_function("parse_int", (s, base) => {
        const i = parseInt(s, base);
        if (!Number.isSafeInteger(i)) {
            return null;
        }
        return i;
    });
    // SQLite REGEXP operator uses `regexp(pattern, value)`
    db.create_function("regexp", (pattern, s) => {
        return new RegExp(pattern, "u").test(s) ? 1 : 0;
    });
}
function createMojidataDbProvider(openDatabase) {
    let dbPromise;
    return function getMojidataDb() {
        dbPromise ?? (dbPromise = openDatabase().then(async (db) => {
            await initDb(db);
            return db;
        }));
        return dbPromise;
    };
}
