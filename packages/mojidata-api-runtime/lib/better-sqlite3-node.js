"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBetterSqlite3MojidataDbProvider = createBetterSqlite3MojidataDbProvider;
exports.createBetterSqlite3ExecutorProvider = createBetterSqlite3ExecutorProvider;
const mojidata_api_sqljs_1 = require("@mandel59/mojidata-api-sqljs");
const better_sqlite3_executor_1 = require("./better-sqlite3-executor");
const promise_cache_1 = require("./promise-cache");
function getBetterSqlite3Ctor() {
    return require("better-sqlite3");
}
function openDatabaseFromFile(path) {
    const Database = getBetterSqlite3Ctor();
    return new Database(path, { readonly: true, fileMustExist: true });
}
function createBetterSqlite3MojidataDbProvider(path) {
    let db;
    let executorPromise;
    return function getMojidataDb() {
        executorPromise ?? (executorPromise = Promise.resolve().then(() => {
            db ?? (db = openDatabaseFromFile(path));
            (0, mojidata_api_sqljs_1.installMojidataSqlFunctions)((name, fn) => {
                db.function(name, fn);
            });
            return (0, better_sqlite3_executor_1.createBetterSqlite3Executor)(db);
        }));
        return executorPromise;
    };
}
function createBetterSqlite3ExecutorProvider(path) {
    const getDb = (0, promise_cache_1.createCachedPromise)(() => Promise.resolve((0, better_sqlite3_executor_1.createBetterSqlite3Executor)(openDatabaseFromFile(path))));
    return function getExecutor() {
        return getDb();
    };
}
