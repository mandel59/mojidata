#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const packagesRoot = path.join(repoRoot, "packages");
const mode = process.argv[2];
const explicitBaseRef = process.argv[3];
const explicitHeadRef = process.argv[4];

const baseRef =
  explicitBaseRef ||
  process.env.CI_BASE_SHA ||
  process.env.GITHUB_BASE_SHA ||
  process.env.GITHUB_EVENT_PULL_REQUEST_BASE_SHA;
const headRef = explicitHeadRef || process.env.CI_HEAD_SHA || "HEAD";

if (!["build", "test", "pack"].includes(mode)) {
  console.error("Usage: node scripts/run-affected-workspaces.mjs <build|test|pack> [baseRef] [headRef]");
  process.exit(1);
}

if (!baseRef) {
  console.error("A base ref is required. Pass it as an argument or set CI_BASE_SHA.");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getChangedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", `${baseRef}...${headRef}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getReferencedWorkspaceNames(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
}

const workspaceDirs = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const workspaces = new Map();
for (const dirName of workspaceDirs) {
  const dir = path.join("packages", dirName);
  const manifestPath = path.join(repoRoot, dir, "package.json");
  const manifest = readJson(manifestPath);
  workspaces.set(manifest.name, {
    dir,
    private: Boolean(manifest.private),
    scripts: manifest.scripts ?? {},
    workspaceDeps: new Set(),
  });
}

for (const workspace of workspaces.values()) {
  const manifest = readJson(path.join(repoRoot, workspace.dir, "package.json"));
  for (const depName of getReferencedWorkspaceNames(manifest)) {
    if (workspaces.has(depName)) {
      workspace.workspaceDeps.add(depName);
    }
  }
}

const reverseDeps = new Map();
for (const workspaceName of workspaces.keys()) {
  reverseDeps.set(workspaceName, new Set());
}
for (const [workspaceName, workspace] of workspaces) {
  for (const depName of workspace.workspaceDeps) {
    reverseDeps.get(depName).add(workspaceName);
  }
}

function getWorkspaceByFile(filePath) {
  for (const [workspaceName, workspace] of workspaces) {
    if (filePath === workspace.dir || filePath.startsWith(`${workspace.dir}/`)) {
      return workspaceName;
    }
  }
  return null;
}

function isIgnoredRootFile(filePath) {
  return (
    filePath === "README.md" ||
    filePath === "AGENTS.md" ||
    filePath === ".gitignore" ||
    filePath.startsWith("docs/")
  );
}

function requiresFullWorkspaceRun(filePath) {
  if (filePath.startsWith(".github/")) {
    return true;
  }
  if (filePath.startsWith(".changeset/")) {
    return true;
  }
  return [
    "package.json",
    "yarn.lock",
    ".pnp.cjs",
    ".pnp.loader.mjs",
    ".yarnrc.yml",
    ".node-version",
  ].includes(filePath);
}

function collectDependents(initialNames) {
  const impacted = new Set(initialNames);
  const queue = [...initialNames];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const dependent of reverseDeps.get(current) ?? []) {
      if (!impacted.has(dependent)) {
        impacted.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return impacted;
}

const changedFiles = getChangedFiles();
let runAll = false;
const directlyChanged = new Set();

for (const filePath of changedFiles) {
  const workspaceName = getWorkspaceByFile(filePath);
  if (workspaceName) {
    directlyChanged.add(workspaceName);
    continue;
  }
  if (isIgnoredRootFile(filePath)) {
    continue;
  }
  if (requiresFullWorkspaceRun(filePath)) {
    runAll = true;
    break;
  }
  runAll = true;
  break;
}

if (changedFiles.length === 0) {
  console.log(`No changed files between ${baseRef} and ${headRef}; skipping ${mode}.`);
  process.exit(0);
}

if (runAll) {
  console.log(`Running full ${mode} because shared infrastructure changed.`);
  if (mode === "build") {
    run("corepack", ["yarn", "ci:build"]);
  } else if (mode === "test") {
    run("corepack", ["yarn", "ci:test"]);
  } else {
    run("corepack", ["yarn", "ci:pack"]);
  }
  process.exit(0);
}

const impacted = [...collectDependents(directlyChanged)].sort();
if (impacted.length === 0) {
  console.log(`No affected workspaces for ${mode}; skipping.`);
  process.exit(0);
}

console.log(`Affected workspaces for ${mode}: ${impacted.join(", ")}`);

if (mode === "build") {
  run("corepack", [
    "yarn",
    "workspaces",
    "foreach",
    "-R",
    "--topological-dev",
    "--from",
    `{${impacted.join(",")}}`,
    "run",
    "prepare",
  ]);
  process.exit(0);
}

for (const workspaceName of impacted) {
  const workspace = workspaces.get(workspaceName);

  if (mode === "test") {
    if (!workspace.scripts["test:ci"]) {
      continue;
    }
    run("corepack", ["yarn", "workspace", workspaceName, "run", "test:ci"]);
    continue;
  }

  if (workspace.private) {
    continue;
  }
  run("corepack", ["yarn", "workspace", workspaceName, "npm", "publish", "-n"]);
}
