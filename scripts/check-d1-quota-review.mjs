import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { changedFiles } from "./ci-change-scope.mjs";

// Include shared SQL, data builders, clients (request fan-out), dependencies,
// and operational tools. New packages/scripts are included automatically.
export function requiresQuotaReview(file) {
  return /^(packages\/|scripts\/|\.github\/workflows\/)/.test(file) && !/\.md$/.test(file)
    || ["package.json", "yarn.lock", "AGENTS.md", "docs/d1-quota-policy.md"].includes(file);
}
export function fingerprint(file, read = file => fs.readFileSync(file)) {
  try { return createHash("sha256").update(read(file)).digest("hex"); }
  catch (error) { if (error.code === "ENOENT") return "deleted"; throw error; }
}
export function validateReviews(files, read = file => fs.readFileSync(file)) {
  const affected = files.filter(requiresQuotaReview);
  if (!affected.length) return;
  const reviews = files.filter(file => /^docs\/d1-quota-reviews\/[^/]+\.json$/.test(file));
  const covered = new Set();
  for (const file of reviews) {
    // Deleted reviews provide no coverage.
    let raw;
    try { raw = read(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const review = JSON.parse(raw);
    if (review.version !== 1) throw new Error(`${file}: unsupported review version`);
    for (const key of ["scope", "beforeAfter", "accountBudget", "validation", "rolloutAndStop"])
      if (typeof review[key] !== "string" || review[key].trim().length < 30)
        throw new Error(`${file}: explain ${key} with concrete evidence`);
    if (!Array.isArray(review.evidence) || !review.evidence.length)
      throw new Error(`${file}: local evidence paths required`);
    for (const evidence of review.evidence) {
      if (typeof evidence !== "string" || evidence.startsWith("/") || evidence.split("/").includes(".."))
        throw new Error(`${file}: evidence must be a repository-relative path`);
      read(evidence);
    }
    if (!["unchanged", "bounded", "blocked"].includes(review.decision))
      throw new Error(`${file}: decision must be unchanged, bounded, or blocked`);
    if (review.decision === "bounded") {
      // Conservative upper bounds, including existing account use and reserves.
      for (const metric of ["reads", "writes"]) {
        const budget = review.budget?.[metric];
        if (!budget || !["limit", "existing", "trafficReserve", "operationUpperBound"].every(
          key => Number.isSafeInteger(budget[key]) && budget[key] >= 0))
          throw new Error(`${file}: ${metric} needs finite nonnegative upper bounds`);
        if (budget.limit > (metric === "reads" ? 5_000_000 : 100_000))
          throw new Error(`${file}: increasing the Free policy limit needs a separate policy change`);
        if (budget.existing + budget.trafficReserve + budget.operationUpperBound > budget.limit)
          throw new Error(`${file}: ${metric} exceeds account budget`);
      }
    }
    if (!review.files || typeof review.files !== "object") throw new Error(`${file}: file fingerprints required`);
    for (const name of affected) {
      if (review.files[name] === fingerprint(name, read)) covered.add(name);
    }
  }
  const missing = affected.filter(file => !covered.has(file));
  if (missing.length) throw new Error(`Missing or stale D1 quota review for:\n${missing.join("\n")}\nSee docs/d1-quota-policy.md`);
}

function main() {
  let files;
  if (process.argv.length === 4) files = changedFiles(process.argv[2], process.argv[3]);
  else {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const pr = process.env.GITHUB_EVENT_NAME === "pull_request";
    const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
    const ref = rev => execFileSync("git", ["rev-parse", rev], { encoding: "utf8" }).trim();
    files = changedFiles(pr ? event.pull_request.base.sha : manual ? ref("HEAD^") : event.before,
      pr ? event.pull_request.head.sha : manual ? ref("HEAD") : event.after, { pullRequest: pr });
  }
  validateReviews(files);
  console.log("D1 quota review: current evidence covers all affected files (human review still required).");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
