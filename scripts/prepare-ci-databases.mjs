import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const phases = ["mojidata", "idsdb-utils", "idsdb", "idsdb-fts5", "idsdb-bvec"];
const lines = ["## Database preparation", "",
  `mojidata cache exact match: ${process.env.MOJIDATA_CACHE_HIT || "false"}`,
  `IDS cache exact match: ${process.env.IDSDB_CACHE_HIT || "false"}`, "",
  "| Phase | Seconds | Result |", "| --- | ---: | --- |"];
let exitCode = 0;
for (const name of phases) {
  console.log(`Preparing @mandel59/${name}`);
  const started = performance.now();
  const result = spawnSync("corepack", ["yarn", "workspace", `@mandel59/${name}`, "run", "prepare"], { stdio: "inherit" });
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  lines.push(`| ${name} | ${seconds} | ${result.status === 0 ? "success" : "failed"} |`);
  if (result.status !== 0) { exitCode = result.status ?? 1; break; }
}
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
process.exitCode = exitCode;
