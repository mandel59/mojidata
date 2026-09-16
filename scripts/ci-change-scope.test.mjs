import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { changedFiles, classifyChanges } from "./ci-change-scope.mjs";

for (const event of ["push", "pull_request"]) {
  test(`${event}: only repository docs skip heavy checks`, () => {
    assert.equal(classifyChanges(event, {}, () => ["docs/a.md", "docs/rollback.json", "README.md", "AGENTS.md"]).runChecks, false);
  });
  for (const file of ["packages/a/index.ts", "packages/a/README.md", "LICENSE.md", ".changeset/new.md", "package.json", "yarn.lock", ".github/workflows/release.yml", "packages/mojidata/download.txt", ".gitignore", "unknown.txt"]) {
    test(`${event}: ${file} mixed with docs still runs checks`, () => {
      assert.equal(classifyChanges(event, {}, () => ["docs/a.md", file]).runChecks, true);
    });
  }
}

test("manual retries never depend on the latest diff", () => {
  assert.equal(classifyChanges("workflow_dispatch", {}, () => { throw Error("must not read diff"); }).runChecks, true);
});
test("missing history, malformed events, new branches and empty diffs run checks", () => {
  for (const event of [{}, { before: "0".repeat(40), after: "1".repeat(40) }, { before: "--help", after: "1".repeat(40) }]) {
    assert.equal(classifyChanges("push", event).runChecks, true);
  }
  assert.equal(classifyChanges("push", {}, () => []).runChecks, true);
  assert.equal(classifyChanges("push", {}, () => { throw Error("missing object"); }).runChecks, true);
  assert.equal(classifyChanges("schedule", {}).runChecks, true);
});

test("real git ranges include earlier pushed code and both sides of a rename", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "mojidata-ci-scope-"));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = () => {
    git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q");
    writeFileSync(path.join(cwd, "README.md"), "base\n");
    const base = commit();
    writeFileSync(path.join(cwd, "app.ts"), "code\n");
    const code = commit();
    mkdirSync(path.join(cwd, "docs"));
    writeFileSync(path.join(cwd, "docs/a\nwith spaces.md"), "docs\n");
    const docs = commit();
    const diff = (a, b, options) => changedFiles(a, b, { ...options, cwd });
    assert.equal(classifyChanges("push", { before: base, after: docs }, diff).runChecks, true);
    assert.equal(classifyChanges("push", { before: code, after: docs }, diff).runChecks, false);
    git("mv", "app.ts", "docs/app.ts");
    const rename = commit();
    assert.equal(classifyChanges("push", { before: docs, after: rename }, diff).runChecks, true);
    // Diverged PR base has unrelated code. A PR diff must use the merge base.
    git("checkout", "-qb", "base-side", code);
    writeFileSync(path.join(cwd, "other.ts"), "unrelated base change\n");
    const advancedBase = commit();
    assert.equal(classifyChanges("pull_request", { pull_request: { base: { sha: advancedBase }, head: { sha: docs } } }, diff).runChecks, false);
    assert.equal(classifyChanges("push", { before: advancedBase, after: docs }, diff).runChecks, true);
    // Exercise the dependency-free Actions entrypoint, including output/summary.
    const eventPath = path.join(cwd, "event.json");
    const output = path.join(cwd, "output");
    const summary = path.join(cwd, "summary");
    writeFileSync(eventPath, JSON.stringify({ before: code, after: docs }));
    execFileSync(process.execPath, [path.resolve("scripts/ci-change-scope.mjs")], {
      cwd, env: { ...process.env, GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(readFileSync(output, "utf8"), "run-checks=false\n");
    assert.match(readFileSync(summary, "utf8"), /Documentation-only/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
