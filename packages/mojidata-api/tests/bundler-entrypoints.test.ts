import assert from "node:assert/strict"
import fs from "node:fs"
import { builtinModules } from "node:module"
import path from "node:path"
import { describe, test } from "node:test"

type PackageJson = {
  name: string
  exports?: Record<string, string | Record<string, string>>
}

const workspaceRoot = path.resolve(__dirname, "..", "..", "..")
const workspacePackages = new Map<string, string>()
const builtinModuleSpecifiers = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
])
for (const entry of fs.readdirSync(path.join(workspaceRoot, "packages"))) {
  const packageDir = path.join(workspaceRoot, "packages", entry)
  const packageJsonPath = path.join(packageDir, "package.json")
  if (!fs.existsSync(packageJsonPath)) continue
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, "utf8"),
  ) as PackageJson
  workspacePackages.set(packageJson.name, packageDir)
}

function readPackageJson(packageDir: string) {
  return JSON.parse(
    fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
  ) as PackageJson
}

function exportTarget(packageDir: string, subpath: string, condition: string) {
  const packageJson = readPackageJson(packageDir)
  const value = packageJson.exports?.[subpath]
  if (typeof value === "string") return value
  if (!value) throw new Error(`${packageJson.name} does not export ${subpath}`)
  return value[condition] ?? value.default ?? value.require ?? value.import
}

function resolveFileWithoutExtension(base: string) {
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`]) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`Cannot resolve file: ${base}`)
}

function resolveRelativeImport(fromFile: string, specifier: string) {
  return resolveFileWithoutExtension(path.resolve(path.dirname(fromFile), specifier))
}

function splitPackageSpecifier(specifier: string) {
  const parts = specifier.split("/")
  if (specifier.startsWith("@")) {
    return {
      packageName: `${parts[0]}/${parts[1]}`,
      subpath: parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".",
    }
  }
  return {
    packageName: parts[0],
    subpath: parts.length > 1 ? `./${parts.slice(1).join("/")}` : ".",
  }
}

function resolveWorkspaceImport(specifier: string, condition: string) {
  const { packageName, subpath } = splitPackageSpecifier(specifier)
  const packageDir = workspacePackages.get(packageName)
  if (!packageDir) return undefined
  return path.join(packageDir, exportTarget(packageDir, subpath, condition))
}

function staticImports(file: string) {
  const source = fs.readFileSync(file, "utf8")
  const imports = new Set<string>()
  for (const pattern of [
    /\brequire\(\s*["']([^"']+)["']\s*\)/gu,
    /\bfrom\s+["']([^"']+)["']/gu,
    /\bimport\s+["']([^"']+)["']/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      imports.add(match[1])
    }
  }
  return [...imports]
}

function collectStaticGraph(entryFile: string, condition: string) {
  const visited = new Set<string>()
  const external = new Set<string>()
  const files: string[] = []

  function visit(file: string) {
    const resolved = resolveFileWithoutExtension(file)
    if (visited.has(resolved)) return
    visited.add(resolved)
    files.push(resolved)

    for (const specifier of staticImports(resolved)) {
      if (specifier.startsWith(".")) {
        visit(resolveRelativeImport(resolved, specifier))
        continue
      }
      const workspaceFile = resolveWorkspaceImport(specifier, condition)
      if (workspaceFile) {
        visit(workspaceFile)
        continue
      }
      external.add(specifier)
    }
  }

  visit(entryFile)
  return { files, external: [...external].sort() }
}

function assertNoExternalImports(
  entry: string,
  external: string[],
  banned: RegExp[],
) {
  const offenders = external.filter((specifier) =>
    banned.some((pattern) => pattern.test(specifier)),
  )
  assert.deepEqual(
    offenders,
    [],
    `${entry} statically imports banned modules: ${offenders.join(", ")}`,
  )
}

function assertNoBuiltinImports(entry: string, external: string[]) {
  const offenders = external.filter((specifier) =>
    builtinModuleSpecifiers.has(specifier),
  )
  assert.deepEqual(
    offenders,
    [],
    `${entry} statically imports Node builtins: ${offenders.join(", ")}`,
  )
}

describe("bundler-safe entrypoint graph", () => {
  const facadeDir = path.join(workspaceRoot, "packages", "mojidata-api")
  const sqliteWasmDir = path.join(
    workspaceRoot,
    "packages",
    "mojidata-api-sqlite-wasm",
  )

  test("browser and edge-safe facade entrypoints avoid Node-only imports", () => {
    const banned = [
      /^better-sqlite3$/u,
      /^@mandel59\/mojidata-api-(better-sqlite3|node-sqlite)$/u,
    ]
    for (const subpath of [
      "./app",
      "./browser-client",
      "./core",
      "./hono",
      "./worker-protocol",
    ]) {
      const entry = path.join(facadeDir, exportTarget(facadeDir, subpath, "require"))
      const graph = collectStaticGraph(entry, "require")
      assertNoBuiltinImports(subpath, graph.external)
      assertNoExternalImports(subpath, graph.external, banned)
    }
  })

  test("browser worker facade avoids native Node backends", () => {
    const entry = path.join(
      facadeDir,
      exportTarget(facadeDir, "./browser-worker", "require"),
    )
    const graph = collectStaticGraph(entry, "require")
    assertNoExternalImports("./browser-worker", graph.external, [
      /^better-sqlite3$/u,
      /^@mandel59\/mojidata-api-(better-sqlite3|node-sqlite)$/u,
    ])
  })

  test("Node sqljs entrypoint does not import native sqlite backends", () => {
    const entry = path.join(
      facadeDir,
      exportTarget(facadeDir, "./node-sqljs", "require"),
    )
    const graph = collectStaticGraph(entry, "require")
    assertNoExternalImports("./node-sqljs", graph.external, [
      /^better-sqlite3$/u,
      /^@mandel59\/mojidata-api-(better-sqlite3|node-sqlite)$/u,
    ])
  })

  test("sqlite-wasm OPFS public entrypoint is importable without private lib paths", () => {
    const entry = path.join(
      sqliteWasmDir,
      exportTarget(sqliteWasmDir, "./opfs-sahpool", "import"),
    )
    const graph = collectStaticGraph(entry, "import")
    assert.ok(graph.files.some((file) => file.endsWith("opfs-sahpool.js")))
  })
})
