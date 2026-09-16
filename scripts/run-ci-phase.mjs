import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const [phase, command, ...args] = process.argv.slice(2);
if (!phase || !/^[a-z][a-z0-9-]*$/.test(phase) || !command) {
  console.error("Usage: node scripts/run-ci-phase.mjs <phase> <command> [args...]");
  process.exitCode = 1;
} else {
  const started = performance.now();
  const result = spawnSync(command, args, { stdio: "inherit" });
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  const status = result.error ? `failed (${result.error.code})`
    : result.signal ? `failed (signal ${result.signal})`
    : result.status === 0 ? "success" : `failed (exit ${result.status})`;
  const summary = `### ${phase}\n\nElapsed: ${seconds} seconds. Result: ${status}.\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exitCode = result.status ?? 1;
}
