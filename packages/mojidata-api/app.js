"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const hono_1 = require("hono");
const cors_1 = require("hono/cors");
const idsfind_1 = require("./api/v1/idsfind");
const ivs_list_1 = require("./api/v1/ivs-list");
const mojidata_1 = require("./api/v1/mojidata");
const mojidata_variants_1 = require("./api/v1/mojidata-variants");
function createApp(db) {
    const app = new hono_1.Hono();
    app.use("/api/*", (0, cors_1.cors)({
        origin: "*",
        allowMethods: ["GET", "OPTIONS"],
    }));
    app.get("/api/v1/mojidata", (0, mojidata_1.createMojidataHandler)(db));
    app.get("/api/v1/ivs-list", (0, ivs_list_1.createIvsListHandler)(db));
    app.get("/api/v1/mojidata-variants", (0, mojidata_variants_1.createMojidataVariantsHandler)(db));
    app.get("/api/v1/idsfind", (0, idsfind_1.createIdsfindHandler)(db));
    return app;
}
