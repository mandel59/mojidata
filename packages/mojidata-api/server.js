"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const node_1 = require("./node");
const port = Number(process.env.PORT ?? 3001);
const app = (0, node_1.createNodeApp)();
(0, node_server_1.serve)({ fetch: app.fetch, port });
console.log(`mojidata-api listening on http://localhost:${port}`);
