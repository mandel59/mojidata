import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { checkImportArtifacts } from "./d1-import-preflight.mjs"

function fixture(t, writes = [60_000, 50_000]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d1-preflight-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const entries = ["mojidata", "idsdb-fts5"].map((name, i) => {
    const sql = `CREATE TABLE example (value TEXT);\nINSERT INTO example VALUES ('${name}');\n`
    fs.writeFileSync(path.join(dir, name + ".sql"), sql)
    return { name, outputByteLength: Buffer.byteLength(sql),
      outputSha256: createHash("sha256").update(sql).digest("hex"),
      importPlan: { recipe: "literal-values-indexes-first-v1", minimumRowsWritten: writes[i] } }
  })
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ formatVersion: 2, entries }))
  return dir
}

test("validates the combined write budget before any selected import", t => {
  const dir = fixture(t)
  assert.throws(() => checkImportArtifacts(dir, ["MOJIDATA_DB", "IDSFIND_DB"]), /110000.*100000/)
  assert.equal(checkImportArtifacts(dir, ["MOJIDATA_DB"]).minimumRowsWritten, 60_000)
  assert.equal(checkImportArtifacts(dir, ["MOJIDATA_DB", "IDSFIND_DB"], 120_000).minimumRowsWritten, 110_000)
})

test("rejects legacy, missing, or modified artifacts", t => {
  const dir = fixture(t)
  fs.appendFileSync(path.join(dir, "mojidata.sql"), "CREATE INDEX late ON example(value);")
  assert.throws(() => checkImportArtifacts(dir, ["MOJIDATA_DB"]), /hash\/size mismatch/)
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ entries: [] }))
  assert.throws(() => checkImportArtifacts(dir, ["MOJIDATA_DB"]), /Legacy import manifest/)
  fs.unlinkSync(path.join(dir, "manifest.json"))
  assert.throws(() => checkImportArtifacts(dir, ["MOJIDATA_DB"]), /Missing import manifest/)
})

test("rejects invalid budgets and unknown or incomplete plans", t => {
  const dir = fixture(t)
  for (const budget of [-1, NaN, Infinity, 1.5]) {
    assert.throws(() => checkImportArtifacts(dir, ["MOJIDATA_DB"], budget), /safe integer/)
  }
  assert.throws(() => checkImportArtifacts(dir, ["UNKNOWN"]), /Unknown import binding/)
  const manifestPath = path.join(dir, "manifest.json")
  const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  delete data.entries[0].importPlan
  fs.writeFileSync(manifestPath, JSON.stringify(data))
  assert.throws(() => checkImportArtifacts(dir, ["MOJIDATA_DB"]), /Missing local-materialization/)
})
