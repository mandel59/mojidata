"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNodeDb = createNodeDb;
exports.createNodeApp = createNodeApp;
const mojidata_api_core_1 = require("@mandel59/mojidata-api-core");
const mojidata_api_hono_1 = require("@mandel59/mojidata-api-hono");
const mojidata_api_sqljs_1 = require("@mandel59/mojidata-api-sqljs");
const better_sqlite3_node_1 = require("./better-sqlite3-node");
const promise_cache_1 = require("./promise-cache");
const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db");
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db");
function createNodeDb({ backend = "sqljs", } = {}) {
    const getMojidataDb = backend === "better-sqlite3"
        ? (0, better_sqlite3_node_1.createBetterSqlite3MojidataDbProvider)(mojidataDbPath)
        : (0, mojidata_api_sqljs_1.createMojidataDbProvider)(() => (0, mojidata_api_sqljs_1.openDatabaseFromFile)(mojidataDbPath));
    const getIdsfindDb = backend === "better-sqlite3"
        ? (0, better_sqlite3_node_1.createBetterSqlite3ExecutorProvider)(idsfindDbPath)
        : (0, promise_cache_1.createCachedPromise)(async () => (0, mojidata_api_sqljs_1.createSqlJsExecutor)(await (0, mojidata_api_sqljs_1.openDatabaseFromFile)(idsfindDbPath)));
    return (0, mojidata_api_core_1.createSqlApiDb)({ getMojidataDb, getIdsfindDb });
}
function createNodeApp(options) {
    return (0, mojidata_api_hono_1.createApp)(createNodeDb(options));
}
