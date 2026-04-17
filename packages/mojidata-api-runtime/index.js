"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMojidataApiWorkerClient = exports.createNodeDb = exports.createNodeApp = void 0;
var node_1 = require("./lib/node");
Object.defineProperty(exports, "createNodeApp", { enumerable: true, get: function () { return node_1.createNodeApp; } });
Object.defineProperty(exports, "createNodeDb", { enumerable: true, get: function () { return node_1.createNodeDb; } });
var browser_client_1 = require("./lib/browser-client");
Object.defineProperty(exports, "createMojidataApiWorkerClient", { enumerable: true, get: function () { return browser_client_1.createMojidataApiWorkerClient; } });
