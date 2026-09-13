import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

const packages = path.resolve(__dirname, "../..")

for (const name of ["idsdb", "idsdb-fts5", "idsdb-bvec"]) {
  for (const scenario of ["recipe", "failed build"]) {
    test(`${name} invalidates the default cache after a ${scenario}`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "idsdb-cache-"))
      try {
        const pkg = path.join(root, "packages", name)
        const scripts = path.join(pkg, "scripts")
        const bin = path.join(root, "bin")
        fs.mkdirSync(scripts, { recursive: true })
        fs.mkdirSync(bin)
        fs.copyFileSync(path.join(packages, name, "scripts/prepare"), path.join(scripts, "prepare"))
        const stamp = path.join(pkg, name === "idsdb" ? ".idsdb.input.sha256" : `.${name}.input.sha256`)
        fs.writeFileSync(stamp, "default-inputs\n")
        for (const file of ["idsfind.db", "idsdecompose.db"]) fs.writeFileSync(path.join(pkg, file), "default")
        fs.writeFileSync(path.join(bin, "python3"), '#!/bin/bash\necho "${TEST_INPUT_HASH:-default-inputs}"\n', { mode: 0o755 })
        const build = '#!/bin/bash\nset -eu\nout="${MOJIDATA_IDSDB_OUT_DIR:-$PWD}"\necho "${MOJIDATA_IDSDB_RECIPE:-default}" > "$out/idsfind.db"\necho built > "$out/idsdecompose.db"\nexit "${TEST_BUILD_EXIT:-0}"\n'
        for (const command of ["node", "yarn"]) fs.writeFileSync(path.join(bin, command), build, { mode: 0o755 })
        const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
        for (const key of Object.keys(env)) if (key.startsWith("MOJIDATA_IDSDB_")) delete env[key]
        const run = (extra: Record<string, string> = {}) => execFileSync("bash", [path.join(scripts, "prepare")], { env: { ...env, ...extra }, encoding: "utf8" })
        assert.match(run(), /skipping rebuild/)
        if (scenario === "recipe") {
          run({ MOJIDATA_IDSDB_RECIPE: "experimental" })
          assert.equal(fs.readFileSync(path.join(pkg, "idsfind.db"), "utf8").trim(), "experimental")
        } else {
          assert.throws(() => run({ TEST_INPUT_HASH: "changed-inputs", TEST_BUILD_EXIT: "1" }))
        }
        assert.equal(fs.existsSync(stamp), false)
        assert.match(run(), /rebuilding/)
        assert.equal(fs.readFileSync(path.join(pkg, "idsfind.db"), "utf8").trim(), "default")
        assert.match(run(), /skipping rebuild/)
      } finally {
        fs.rmSync(root, { recursive: true, force: true })
      }
    })
  }
}

test("IDSDB input hash tracks builder libraries and semantics manifests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idsdb-hash-"))
  try {
    const script = path.join(root, "idsdb/scripts/input-hash.py")
    fs.mkdirSync(path.dirname(script), { recursive: true })
    fs.copyFileSync(path.join(packages, "idsdb/scripts/input-hash.py"), script)
    const files = [
      "idsdb/package.json", "idsdb/tsconfig.json", "idsdb/prepare.ts",
      "idsdb/lib/idsflow-adapter.ts", "idsdb/lib/idsfind-semantics-manifest.ts",
      "idsdb/lib/idsfind-bvec-db.ts", "mojidata/dist/moji.db",
      ...["package.json", "tsconfig.json", "index.ts", "index.js", "index.d.ts", "node.ts", "node.js", "node.d.ts", "lib/idsflow.ts"].map(file => `idsdb-utils/${file}`),
    ]
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), file)
    }
    const hash = () => execFileSync("python3", [script], { encoding: "utf8" }).trim()
    let previous = hash()
    assert.equal(hash(), previous)
    for (const file of ["idsfind-semantics-manifest.ts", "idsfind-bvec-db.ts"]) {
      fs.appendFileSync(path.join(root, "idsdb/lib", file), "changed")
      const next = hash()
      assert.notEqual(next, previous)
      previous = next
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
