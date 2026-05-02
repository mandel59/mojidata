# mojidata-api-bench

Internal benchmark tooling for comparing `mojidata-api` backends and deployments.

This workspace is private and is not published to npm.

The benchmark scenario set is versioned in [benchmarks/scenarios.json](benchmarks/scenarios.json).

Common commands from the repository root:

```sh
yarn mojidata-api:bench:prepare
yarn mojidata-api:bench:local -- --scenario ivs-list --iterations 10
yarn mojidata-api:bench:remote --base-url https://example.com --label worker-d1 -- --scenario idsfind-ids --iterations 10
yarn mojidata-api:bench --backend sqljs --output ./tmp/sqljs.json
yarn mojidata-api:bench --backend better-sqlite3 --output ./tmp/better-sqlite3.json
yarn mojidata-api:bench --backend node:sqlite --output ./tmp/node-sqlite.json
yarn mojidata-api:bench:compare ./tmp/sqljs.json ./tmp/better-sqlite3.json
node ./benchmarks/compare-idsfind-fts.mjs --output ./tmp/idsfind-fts.json
```
