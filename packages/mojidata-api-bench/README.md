# mojidata-api-bench

Internal benchmark tooling for comparing `mojidata-api` backends and deployments.

This workspace is private and is not published to npm.

The benchmark scenario set is versioned in [benchmarks/scenarios.json](/Users/mandel59/ws/mojidata/packages/mojidata-api-bench/benchmarks/scenarios.json).

Common commands from the repository root:

```sh
yarn mojidata-api:bench:prepare
yarn mojidata-api:bench:local -- --scenario ivs-list --iterations 10
yarn mojidata-api:bench --backend sqljs --output ./tmp/sqljs.json
yarn mojidata-api:bench --backend better-sqlite3 --output ./tmp/better-sqlite3.json
yarn mojidata-api:bench:compare ./tmp/sqljs.json ./tmp/better-sqlite3.json
```
