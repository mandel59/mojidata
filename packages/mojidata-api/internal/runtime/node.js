"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNodeDb = createNodeDb;
exports.createNodeApp = createNodeApp;
const promise_cache_1 = require("../../api/v1/_lib/promise-cache");
const better_sqlite3_node_1 = require("../../api/v1/_lib/better-sqlite3-node");
const app_1 = require("../app");
const core_1 = require("../core");
const sqljs_1 = require("../adapter/sqljs");
const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db");
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db");
function createNodeDb({ backend = "sqljs", } = {}) {
    const getMojidataDb = backend === "better-sqlite3"
        ? (0, better_sqlite3_node_1.createBetterSqlite3MojidataDbProvider)(mojidataDbPath)
        : (0, sqljs_1.createMojidataDbProvider)(() => (0, sqljs_1.openDatabaseFromFile)(mojidataDbPath));
    const getIdsfindDb = backend === "better-sqlite3"
        ? (0, better_sqlite3_node_1.createBetterSqlite3ExecutorProvider)(idsfindDbPath)
        : (0, promise_cache_1.createCachedPromise)(async () => (0, sqljs_1.createSqlJsExecutor)(await (0, sqljs_1.openDatabaseFromFile)(idsfindDbPath)));
    return (0, core_1.createSqlApiDb)({ getMojidataDb, getIdsfindDb });
}
function createNodeApp(options) {
    return (0, app_1.createApp)(createNodeDb(options));
}
