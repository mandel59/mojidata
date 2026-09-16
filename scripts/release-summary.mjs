import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseSummary({ changesetsOutcome, hasChangesets, pullRequestNumber, publishOutcome }) {
  if (changesetsOutcome !== "success") {
    return "Release PR/publish selection did not complete successfully. See the preceding steps.";
  }
  if (hasChangesets === "true") {
    return /^[1-9][0-9]*$/.test(pullRequestNumber ?? "")
      ? `Release pull request #${pullRequestNumber} was created or updated. No npm publish ran.`
      : "No release pull request was created or updated (for example, only empty changesets remain). No npm publish ran.";
  }
  if (hasChangesets === "false") {
    return publishOutcome === "success"
      ? "Trusted publishing command completed successfully. It may have found no unpublished versions; see the publish log for package results."
      : `Trusted publishing did not complete successfully (step outcome: ${["failure", "cancelled", "skipped"].includes(publishOutcome) ? publishOutcome : "unknown"}). See the publish log before retrying.`;
  }
  return "Release selection returned no recognized result. Check the Changesets step.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = "## Release result\n\n" + releaseSummary({
    changesetsOutcome: process.env.CHANGESETS_OUTCOME,
    hasChangesets: process.env.CHANGESETS_HAS_CHANGESETS,
    pullRequestNumber: process.env.CHANGESETS_PULL_REQUEST_NUMBER,
    publishOutcome: process.env.PUBLISH_OUTCOME,
  }) + "\n";
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
