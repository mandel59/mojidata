import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import Database from "better-sqlite3"
import { loadIdsFlowRecipe } from "../lib/idsflow-adapter"

function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "idsflow-"))
    const dbPath = path.join(directory, "moji.db")
    const db = new Database(dbPath)
    db.exec([
        "CREATE TABLE ids (UCS TEXT, source TEXT, IDS TEXT);",
        "CREATE TABLE usource (U_source_ID TEXT, IDS TEXT);",
    ].join("\n"))
    db.prepare("INSERT INTO ids VALUES (?, ?, ?)").run(
        String.fromCodePoint(0x660e), "GS",
        String.fromCodePoint(0x2ff0, 0x65e5, 0x6708),
    )
    db.prepare("INSERT INTO ids VALUES (?, ?, ?)").run(
        String.fromCodePoint(0x8a9e), "T",
        String.fromCodePoint(0x2ff0, 0x8a00, 0x543e),
    )
    db.prepare("INSERT INTO usource VALUES (?, ?)").run(
        "UTC-001", String.fromCodePoint(0x2ff1, 0x65e5, 0x6708),
    )
    db.close()
    return { directory, dbPath }
}

test("reads, selects, unions, and separates roots from definitions", () => {
    const { directory, dbPath } = fixture()
    try {
        const recipePath = path.join(directory, "idsflow.yaml")
        fs.writeFileSync(recipePath, [
            "version: 1",
            "datasets:",
            "  babelstone:",
            "    read: { kind: moji-ids }",
            "  g:",
            "    select: { input: babelstone, irg_source: G }",
            "  usource:",
            "    read: { kind: moji-usource }",
            "  roots:",
            "    union: { inputs: [g, usource] }",
            "  expanded:",
            "    decompose:",
            "      input: roots",
            "      using: g",
            "      expand_z_variants: false",
            "output: expanded",
        ].join("\n"))
        const loaded = loadIdsFlowRecipe(recipePath, { defaultMojidb: dbPath })
        assert.equal(loaded.output.kind, "decompose")
        if (loaded.output.kind !== "decompose") return
        assert.deepEqual(loaded.output.roots, [
            { char: "\u660E", IDS: "\u2FF0\u65E5\u6708", idsDataSource: "babelstone", irgSource: "G" },
            { char: "&UTC-001;", IDS: "\u2FF1\u65E5\u6708", idsDataSource: "usource", irgSource: "UTC" },
        ])
        assert.deepEqual(loaded.output.definitions, [
            { char: "\u660E", IDS: "\u2FF0\u65E5\u6708", idsDataSource: "babelstone", irgSource: "G" },
        ])
        assert.equal(loaded.output.expandZVariants, false)
        assert.equal(loaded.output.normalizeKdpvRadicalVariants, true)
    } finally {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test("allows converted EIDS to be output without recursive decomposition", () => {
    const { directory, dbPath } = fixture()
    try {
        fs.writeFileSync(path.join(directory, "chise.eids"), "\u3010\u660E\u3011\u2FF0\u65E5\u6708")
        const recipePath = path.join(directory, "idsflow.yaml")
        fs.writeFileSync(recipePath, [
            "version: 1",
            "datasets:",
            "  chise:",
            "    read:",
            "      kind: eids",
            "      path: chise.eids",
            "      data_source: chise",
            "output: chise",
        ].join("\n"))
        const loaded = loadIdsFlowRecipe(recipePath, { defaultMojidb: dbPath })
        assert.equal(loaded.output.kind, "records")
        if (loaded.output.kind !== "records") return
        assert.deepEqual(loaded.output.records, [
            { char: "\u660E", IDS: "\u2FF0\u65E5\u6708", idsDataSource: "chise", irgSource: null },
        ])
        assert.equal(loaded.eidsReports[0].entries, 1)
    } finally {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

test("rejects unknown keys and cyclic references", () => {
    const { directory, dbPath } = fixture()
    try {
        const badKey = path.join(directory, "bad-key.yaml")
        fs.writeFileSync(badKey, [
            "version: 1",
            "datasets:",
            "  input:",
            "    read: { kind: moji-ids, typo: true }",
            "  expanded:",
            "    decompose: { input: input }",
            "output: expanded",
        ].join("\n"))
        assert.throws(
            () => loadIdsFlowRecipe(badKey, { defaultMojidb: dbPath }),
            /unknown key: typo/,
        )

        const cycle = path.join(directory, "cycle.yaml")
        fs.writeFileSync(cycle, [
            "version: 1",
            "datasets:",
            "  a:",
            "    union: { inputs: [b] }",
            "  b:",
            "    union: { inputs: [a] }",
            "  expanded:",
            "    decompose: { input: a }",
            "output: expanded",
        ].join("\n"))
        assert.throws(
            () => loadIdsFlowRecipe(cycle, { defaultMojidb: dbPath }),
            /cyclic dataset reference/,
        )
    } finally {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})
