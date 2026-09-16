import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import test from "node:test"
import Database from "better-sqlite3"
import { deriveIdsfindIndex } from "../build-index-derived"

const packageDir = path.resolve(__dirname, "..")

test("derived FTS5 and bvec preserve full-builder rows, semantics and index contents", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "idsdb-derived-"))
    const build = (mode: string, out: string) => {
        const env = { ...process.env }
        for (const name of Object.keys(env)) if (name.startsWith("MOJIDATA_IDSDB_")) delete env[name]
        execFileSync(process.execPath, ["--import", "tsx", "prepare.ts"], {
            cwd: packageDir,
            env: { ...env, MOJIDATA_IDSDB_RECIPE: path.join(__dirname, "fixtures/minimal.idsflow.yaml"), MOJIDATA_IDSDB_OUT_DIR: out, MOJIDATA_IDSDB_INDEX_MODE: mode },
            stdio: ["ignore", "pipe", "pipe"],
        })
    }
    try {
        const base = path.join(root, "base")
        build("fts4", base)
        const original = fs.readFileSync(path.join(base, "idsfind.db"))
        for (const mode of ["fts5", "bvec"] as const) {
            const full = path.join(root, `full-${mode}`)
            const derived = path.join(root, `derived-${mode}`)
            build(mode, full)
            deriveIdsfindIndex(base, derived, mode)
            assert.deepEqual(fs.readFileSync(path.join(base, "idsfind.db")), original)
            assert.deepEqual(fs.readFileSync(path.join(base, "idsdecompose.db")), fs.readFileSync(path.join(derived, "idsdecompose.db")))
            const db = new Database(path.join(derived, "idsfind.db"))
            try {
                db.prepare("ATTACH DATABASE ? AS reference").run(path.join(full, "idsfind.db"))
                for (const table of ["idsfind", "idsfind_build_meta", "idsfind_semantics", ...(mode === "fts5" ? ["idsfind_ref"] : ["idsfind_bvec_meta", "idsfind_bvec_block"])]) {
                    assert.deepEqual(db.prepare(`SELECT * FROM main.${table}`).all(), db.prepare(`SELECT * FROM reference.${table}`).all(), table)
                }
                if (mode === "fts5") {
                    for (const query of ['"日"', '"月"', '"⿰"', '"§"', '"日" AND "月"', '"木"']) {
                        assert.deepEqual(db.prepare("SELECT rowid FROM main.idsfind_fts WHERE idsfind_fts MATCH ? ORDER BY rowid").all(query), db.prepare("SELECT rowid FROM reference.idsfind_fts WHERE idsfind_fts MATCH ? ORDER BY rowid").all(query), query)
                    }
                }
                assert.equal(db.pragma("integrity_check", { simple: true }), "ok")
            } finally { db.close() }
        }
        assert.throws(() => deriveIdsfindIndex(base, base, "fts5"), /must differ/)
        assert.throws(() => deriveIdsfindIndex(path.join(root, "full-fts5"), path.join(root, "invalid"), "fts5"), /FTS4 base/)
        assert.equal(fs.existsSync(path.join(root, "invalid/idsfind.db")), false)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
