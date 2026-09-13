import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { parseIdsFlowRecordsJsonl } from "@mandel59/idsdb-utils"
import { run } from "../bin/idsflow-eids"
import {
    convertEidsDictionary,
    convertEidsToIdsFlowJsonl,
    dropEidsStructuralHeads,
    projectEidsParityCorpus,
} from "../lib/eids"

test("converts IDSgrep EIDS dictionary trees to IDS rows", () => {
    const converted = convertEidsDictionary(`
〖EIDS dictionary header
and license〗;
【明】⿰日月
【AJ1-01146】⿸<AJ1-21127>;斗
【森】⿱<林>⿰木木木
`)
    assert.deepEqual(converted.entries, [
        { UCS: "明", source: "*", IDS: "⿰日月" },
        { UCS: "&AJ1-01146;", source: "*", IDS: "⿸&AJ1-21127;斗" },
        { UCS: "森", source: "*", IDS: "⿱⿰木木木" },
    ])
    assert.deepEqual(converted.skipped, {
        missingOrUnsupportedHead: 1,
        unsupportedTree: 0,
    })
})

test("canonicalizes bracketed IDSgrep operator aliases", () => {
    assert.deepEqual(convertEidsDictionary("【語】[lr]言[tb]五口").entries, [
        { UCS: "語", source: "*", IDS: "⿰言⿱五口" },
    ])
})

test("keeps escaped EIDS heads and leaves", () => {
    assert.deepEqual(convertEidsDictionary("<CDP\\x2D8B7C>[lr]木\\X65E5").entries, [
        { UCS: "&CDP-8B7C;", source: "*", IDS: "⿰木日" },
    ])
})

test("drops structural heads but keeps leaf identities", () => {
    const projected = dropEidsStructuralHeads(
        "【森】⿱木<林>⿰木木\n【明】⿰<日>;月",
    )
    assert.equal(projected.output, "⿱木⿰木木\n⿰【日】;月\n")
    assert.equal(projected.removed, 3)
})

test("round-trips escaped functors while dropping heads", () => {
    const projected = dropEidsStructuralHeads("【entry】[custom]木日")
    assert.equal(projected.output, "[custom]木日\n")
    assert.equal(projected.removed, 1)
})

test("projects a shared EIDS parity corpus", () => {
    const source = [
        "〖EIDS dictionary header and license〗;",
        "【森】⿱木<林>⿰木木",
        "【明】[lr]<sun>;月",
        "【bad】[and]日月",
    ].join("\n")
    const projected = projectEidsParityCorpus(source)
    assert.equal(projected.output, "【森】⿱木⿰木木\n【明】⿰【sun】;月\n")
    assert.equal(projected.entries, 2)
    assert.deepEqual(projected.skipped, {
        missingOrUnsupportedHead: 1,
        unsupportedTree: 1,
    })
    assert.equal(projected.removedStructuralHeads, 1)
    assert.deepEqual(
        convertEidsDictionary(projected.output).entries,
        convertEidsDictionary(source).entries,
    )
})

test("counts EIDS-only operators that ordinary IDS cannot represent", () => {
    assert.deepEqual(convertEidsDictionary("【明】[and]日月").skipped, {
        missingOrUnsupportedHead: 0,
        unsupportedTree: 1,
    })
})

test("consumes children of unsupported plain EIDS functors as one entry", () => {
    const converted = convertEidsDictionary("【entry】,<明>⿰日月語")
    assert.deepEqual(converted.entries, [])
    assert.equal(converted.skipped.unsupportedTree, 1)
})

test("emits neutral versioned IDSFlow records", () => {
    const converted = convertEidsToIdsFlowJsonl("【明】[lr]日月【bad】[and]日月", "chise")
    assert.equal(converted.entries, 1)
    assert.equal(converted.skipped, 1)
    assert.deepEqual(parseIdsFlowRecordsJsonl(converted.output), {
        records: [{ char: "明", IDS: "⿰日月", idsDataSource: "chise", irgSource: null }],
        skipped: 1,
    })
})

test("rejects malformed EIDS instead of partially importing it", () => {
    assert.throws(() => convertEidsDictionary("【明】[lr日月"), /unclosed \[ bracket at line 1/)
})

test("CLI boundary reads EIDS and returns neutral output", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "idsflow-eids-"))
    try {
        const inputPath = path.join(directory, "dictionary.eids")
        fs.writeFileSync(inputPath, "【明】⿰日月")
        const result = run(["--data-source", "chise", inputPath])
        assert.match(result.summary, /converted 1 entries; skipped 0/)
        assert.equal(parseIdsFlowRecordsJsonl(result.output).records[0].idsDataSource, "chise")
    } finally {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})
