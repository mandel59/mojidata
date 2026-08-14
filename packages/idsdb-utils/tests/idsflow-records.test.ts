import assert from "node:assert/strict"
import test from "node:test"
import { formatIdsFlowRecordsJsonl, parseIdsFlowRecordsJsonl } from "../lib/idsflow-records"

const records = [
    { char: "明", IDS: "⿰日月", idsDataSource: "chise", irgSource: null },
    { char: "語", IDS: "⿰言吾", idsDataSource: "babelstone", irgSource: "G" },
]

test("round-trips versioned IDSFlow records", () => {
    const text = formatIdsFlowRecordsJsonl(records, { skipped: 3 })
    assert.deepEqual(parseIdsFlowRecordsJsonl(text), { records, skipped: 3 })
})

test("rejects unversioned and extended records", () => {
    assert.throws(() => parseIdsFlowRecordsJsonl(""), /input is empty/)
    assert.throws(() => parseIdsFlowRecordsJsonl('{"char":"明"}\n'), /must declare idsflow-records version 1/)
    assert.throws(() => parseIdsFlowRecordsJsonl([
        '{"format":"idsflow-records","version":1}',
        '{"char":"明","IDS":"⿰日月","ids_data_source":"chise","irg_source":null,"typo":1}',
    ].join("\n")), /unknown key: typo/)
})
