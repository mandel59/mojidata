# mojidata-api Benchmarks

`mojidata-api` backend benchmarks live in the private workspace `@mandel59/mojidata-api-bench`.

The benchmark scenario set is defined and versioned in [packages/mojidata-api-bench/benchmarks/scenarios.json](/Users/mandel59/ws/mojidata/packages/mojidata-api-bench/benchmarks/scenarios.json). Keep that version stable when comparing historical results. If the scenario set changes, bump `scenarioSetVersion` in the manifest so older result files can be identified correctly.

## Prepare

Run the benchmark dependency preparation once before local runs:

```sh
yarn mojidata-api:bench:prepare
```

This prepares the `mojidata`, `idsdb`, and split `mojidata-api-*` packages that the benchmark runner depends on.

## Compare local backends

Save comparable local benchmark runs as JSON:

```sh
yarn mojidata-api:bench --backend sqljs --output artifacts/bench/sqljs.json
yarn mojidata-api:bench --backend better-sqlite3 --output artifacts/bench/better-sqlite3.json
yarn mojidata-api:bench:compare artifacts/bench/sqljs.json artifacts/bench/better-sqlite3.json
```

For a one-command local bundle, use:

```sh
yarn mojidata-api:bench:local --output-dir artifacts/bench/local
```

That command writes:

- `sqljs.json`
- `better-sqlite3.json`
- `compare.txt`
- `compare.json`

## Limit the scenario set

Benchmark a single representative scenario when iterating on one code path:

```sh
yarn mojidata-api:bench --backend sqljs --scenario ivs-list --iterations 10 --warmup 1 --cold 1
```

When comparing two runs, keep the scenario selection and iteration settings identical.

## Compare a branch against `main`

One straightforward workflow is:

1. On the branch under test, save a benchmark result to a file.
2. Switch to `main` and save the same benchmark configuration to a second file.
3. Compare the two files with `yarn mojidata-api:bench:compare`.

Example:

```sh
yarn mojidata-api:bench --backend better-sqlite3 --output artifacts/bench/branch.json
yarn mojidata-api:bench:compare artifacts/bench/main.json artifacts/bench/branch.json
```

The comparison output includes the recorded git revision, benchmark label, runtime metadata, and `scenarioSetVersion`, so mismatched inputs are visible.

## Compare a remote target

Use the same benchmark runner for a remote deployment:

```sh
yarn mojidata-api:bench \
  --base-url https://example.com \
  --label worker-d1 \
  --output artifacts/bench/worker-d1.json
```

Then compare that result against a local backend baseline:

```sh
yarn mojidata-api:bench:compare \
  artifacts/bench/better-sqlite3.json \
  artifacts/bench/worker-d1.json
```

## GitHub Actions

The repository provides a manual workflow, `Mojidata API Benchmark`, that benchmarks:

- in-process `sql.js`
- in-process `better-sqlite3`
- an optional remote target via `remote_base_url`

It uploads JSON outputs and comparison reports as workflow artifacts and copies the text comparison into the job summary.

## Interpretation notes

- Treat GitHub-hosted runner numbers as comparative, not absolute.
- For local before/after measurements, use the same machine and Node version when possible.
- If `scenarioSetVersion` differs between two saved runs, regenerate one side or compare only with a deliberate version-mismatch override.
