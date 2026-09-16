import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { releaseSummary } from "./release-summary.mjs";

test("empty changesets do not claim a release PR was created", () => {
  const result = releaseSummary({ changesetsOutcome: "success", hasChangesets: "true" });
  assert.match(result, /No release pull request was created/);
  assert.match(result, /No npm publish ran/);
  assert.match(releaseSummary({ changesetsOutcome: "success", hasChangesets: "true", pullRequestNumber: "62" }), /#62 was created or updated/);
});

test("summary distinguishes publish failure, successful no-op and incomplete selection", () => {
  const input = { changesetsOutcome: "success", hasChangesets: "false", pendingOutcome: "success", pendingPublish: "true" };
  assert.match(releaseSummary({ ...input, publishOutcome: "success" }), /may have found no unpublished versions/);
  for (const publishOutcome of ["failure", "cancelled", "skipped", undefined]) {
    assert.match(releaseSummary({ ...input, publishOutcome }), /did not complete successfully/);
  }
  assert.match(releaseSummary({ changesetsOutcome: "failure" }), /selection did not complete/);
  assert.match(releaseSummary({ changesetsOutcome: "success" }), /no recognized result/);
  assert.match(releaseSummary({ ...input, pendingPublish: "false" }), /already published/);
  assert.match(releaseSummary({ ...input, pendingOutcome: "failure" }), /unpublished-version check did not complete/);
});

test("phase runner preserves success and failure codes and writes timing summaries", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mojidata-phase-"));
  try {
    const summary = path.join(directory, "summary.md");
    for (const status of [0, 7]) {
      const result = spawnSync(process.execPath, ["scripts/run-ci-phase.mjs", "test", process.execPath, "-e", `process.exit(${status})`], {
        encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      });
      assert.equal(result.status, status, result.stderr);
      assert.match(result.stdout, /Elapsed: \d+\.\d+ seconds/);
    }
    const result = spawnSync(process.execPath, ["scripts/run-ci-phase.mjs", "test", path.join(directory, "missing-command")], {
      encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(result.status, 1);
    const text = readFileSync(summary, "utf8");
    assert.match(text, /Result: success/);
    assert.match(text, /failed \(exit 7\)/);
    assert.match(text, /failed \(ENOENT\)/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
