import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Only repository documentation is excluded. Package READMEs, licenses,
// Changesets and unknown files can affect shipped artifacts or build inputs.
export function isDocumentationFile(file) {
  return file === "README.md" || file === "AGENTS.md" || file.startsWith("docs/");
}

export function changedFiles(base, head, { pullRequest = false, cwd = process.cwd() } = {}) {
  if (![base, head].every(ref => /^[0-9a-f]{40,64}$/i.test(ref) && !/^0+$/.test(ref))) {
    throw new Error("Missing or invalid comparison commit");
  }
  const range = pullRequest ? `${base}...${head}` : `${base}..${head}`;
  // Disable rename detection so a move from code into docs also reports the
  // deleted code path. NUL delimiters preserve spaces, quotes and newlines.
  return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", range, "--"], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).split("\0").filter(Boolean);
}

export function classifyChanges(eventName, event, diff = changedFiles) {
  if (eventName === "workflow_dispatch") {
    return { runChecks: true, reason: "Manual run: checks and release retries remain enabled." };
  }
  if (!["push", "pull_request"].includes(eventName)) {
    return { runChecks: true, reason: "Unknown event: running checks conservatively." };
  }
  try {
    const pullRequest = eventName === "pull_request";
    const base = pullRequest ? event.pull_request?.base?.sha : event.before;
    const head = pullRequest ? event.pull_request?.head?.sha : event.after;
    const files = diff(base, head, { pullRequest });
    const docsOnly = files.length > 0 && files.every(isDocumentationFile);
    return {
      runChecks: !docsOnly,
      reason: docsOnly
        ? `Documentation-only change (${files.length} files): skipping DB preparation, build, tests, pack and automatic release.`
        : "Code, release inputs, unknown files or an empty diff: running checks.",
    };
  } catch {
    return { runChecks: true, reason: "Comparison unavailable: running checks conservatively." };
  }
}

function main() {
  let result;
  try {
    result = classifyChanges(process.env.GITHUB_EVENT_NAME,
      JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")));
  } catch {
    result = { runChecks: true, reason: "Event payload unavailable: running checks conservatively." };
  }
  console.log(result.reason);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `run-checks=${result.runChecks}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## CI change scope\n\n${result.reason}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
