"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBetterSqlite3MojidataDbProvider = createBetterSqlite3MojidataDbProvider;
exports.createBetterSqlite3ExecutorProvider = createBetterSqlite3ExecutorProvider;
const promise_cache_1 = require("./promise-cache");
const mojidata_db_1 = require("./mojidata-db");
const better_sqlite3_executor_1 = require("./better-sqlite3-executor");
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
            (0, mojidata_db_1.installMojidataSqlFunctions)((name, fn) => {
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
