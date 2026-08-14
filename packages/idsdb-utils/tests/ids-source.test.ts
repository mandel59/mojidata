import assert from "node:assert/strict"
import test from "node:test"
import { parseBabelStoneIdsSourceExpression } from "../lib/ids-source"

test("normalizes BabelStone one-letter IDS sources to IRG prefix bases", () => {
    assert.deepEqual(
        parseBabelStoneIdsSourceExpression("GHTJKPVUSB"),
        ["G", "H", "T", "J", "K", "KP", "V", "UTC", "SAT", "UK"],
    )
})

test("keeps canonical multi-character source bases atomic", () => {
    assert.deepEqual(parseBabelStoneIdsSourceExpression("SG"), ["SG"])
    assert.deepEqual(parseBabelStoneIdsSourceExpression("MYSATUKUTC"), ["MY", "SAT", "UK", "UTC"])
    assert.deepEqual(parseBabelStoneIdsSourceExpression("KP"), ["K", "KP"])
})

test("preserves BabelStone-specific glyph contexts", () => {
    assert.deepEqual(parseBabelStoneIdsSourceExpression("UCS2003XZ"), ["UCS2003", "X", "Z"])
})

test("brackets keep adjacent legacy sources distinct", () => {
    assert.deepEqual(parseBabelStoneIdsSourceExpression("S[G][V]"), ["SAT", "G", "V"])
})

test("rejects an unknown source designation", () => {
    assert.throws(() => parseBabelStoneIdsSourceExpression("Q"), /unknown BabelStone IDS source expression/)
})
