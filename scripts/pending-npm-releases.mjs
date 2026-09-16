import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function publicPackages(root) {
  const config = JSON.parse(readFileSync(path.join(root, ".changeset/config.json"), "utf8"));
  return readdirSync(path.join(root, "packages"), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => JSON.parse(readFileSync(path.join(root, "packages", entry.name, "package.json"), "utf8")))
    .filter(pkg => !pkg.private && !config.ignore.includes(pkg.name));
}

export async function pendingReleases(packages, fetchMetadata = fetch) {
  const results = await Promise.all(packages.map(async pkg => {
    if (pkg.publishConfig?.registry && new URL(pkg.publishConfig.registry).origin !== "https://registry.npmjs.org") {
      throw new Error(`Unsupported publishing registry for ${pkg.name}`);
    }
    const response = await fetchMetadata(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) return { name: pkg.name, version: pkg.version };
    if (!response.ok) throw new Error(`npm lookup failed for ${pkg.name}@${pkg.version}: HTTP ${response.status}`);
    const published = await response.json();
    if (published.name !== pkg.name || published.version !== pkg.version) {
      throw new Error(`Unexpected npm metadata for ${pkg.name}@${pkg.version}`);
    }
    return null;
  }));
  return results.filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Write outputs only after every lookup succeeds. Network/auth errors must
  // never be interpreted as "already published" or enable unchecked publishing.
  const pending = await pendingReleases(publicPackages(process.cwd()));
  const summary = "## Pending npm releases\n\n" + (pending.length
    ? pending.map(pkg => `- ${pkg.name}@${pkg.version}`).join("\n")
    : "All public workspace versions are already published; heavy checks and publishing are skipped.") + "\n";
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${pending.length > 0}\n`);
}
