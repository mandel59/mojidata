"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNodeDb = createNodeDb;
exports.createNodeApp = createNodeApp;
const hono_1 = require("./hono");
const better_sqlite3_node_1 = require("./api/v1/_lib/better-sqlite3-node");
const mojidata_api_db_sql_1 = require("./api/v1/_lib/mojidata-api-db-sql");
const mojidata_db_1 = require("./api/v1/_lib/mojidata-db");
const promise_cache_1 = require("./api/v1/_lib/promise-cache");
const sqljs_node_1 = require("./api/v1/_lib/sqljs-node");
const sqljs_executor_1 = require("./api/v1/_lib/sqljs-executor");
const mojidataDbPath = require.resolve("@mandel59/mojidata/dist/moji.db");
const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db");
function createNodeDb({ backend = "sqljs", } = {}) {
    const getMojidataDb = backend === "better-sqlite3"
        ? (0, better_sqlite3_node_1.createBetterSqlite3MojidataDbProvider)(mojidataDbPath)
        : (0, mojidata_db_1.createMojidataDbProvider)(() => (0, sqljs_node_1.openDatabaseFromFile)(mojidataDbPath));
    const getIdsfindDb = backend === "better-sqlite3"
        ? (0, better_sqlite3_node_1.createBetterSqlite3ExecutorProvider)(idsfindDbPath)
        : (0, promise_cache_1.createCachedPromise)(async () => (0, sqljs_executor_1.createSqlJsExecutor)(await (0, sqljs_node_1.openDatabaseFromFile)(idsfindDbPath)));
    return (0, mojidata_api_db_sql_1.createSqlApiDb)({ getMojidataDb, getIdsfindDb });
}
function createNodeApp(options) {
    return (0, hono_1.createApp)(createNodeDb(options));
}
