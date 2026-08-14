import assert from "node:assert/strict"
import test from "node:test"

import { convertEidsDictionary } from "../lib/eids"

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
    const converted = convertEidsDictionary("【語】[lr]言[tb]五口")
    assert.deepEqual(converted.entries, [
        { UCS: "語", source: "*", IDS: "⿰言⿱五口" },
    ])
})

test("keeps escaped EIDS heads and leaves", () => {
    const converted = convertEidsDictionary("<CDP\\x2D8B7C>[lr]木\\X65E5")
    assert.deepEqual(converted.entries, [
        { UCS: "&CDP-8B7C;", source: "*", IDS: "⿰木日" },
    ])
})

test("counts EIDS-only operators that ordinary IDS cannot represent", () => {
    const converted = convertEidsDictionary("【明】[and]日月")
    assert.deepEqual(converted.entries, [])
    assert.deepEqual(converted.skipped, {
        missingOrUnsupportedHead: 0,
        unsupportedTree: 1,
    })
})

test("consumes children of unsupported plain EIDS functors as one entry", () => {
    const converted = convertEidsDictionary("【entry】,<明>⿰日月語")
    assert.deepEqual(converted.entries, [])
    assert.deepEqual(converted.skipped, {
        missingOrUnsupportedHead: 0,
        unsupportedTree: 1,
    })
})

test("rejects malformed EIDS instead of partially importing it", () => {
    assert.throws(
        () => convertEidsDictionary("【明】[lr日月"),
        /unclosed \[ bracket at line 1/,
    )
})
