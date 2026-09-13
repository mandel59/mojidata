import assert from "node:assert/strict"
import test from "node:test"

import {
    evaluateIdsFlowRecipe,
    type IdsFlowReadResult,
} from "../lib/idsflow"

const inputs: Record<string, IdsFlowReadResult> = {
    babelstone: {
        records: [
            { char: "明", IDS: "⿰日月", idsDataSource: "babelstone", irgSource: "G" },
            { char: "語", IDS: "⿰言吾", idsDataSource: "babelstone", irgSource: "T" },
        ],
    },
    usource: {
        records: [
            { char: "&UTC-001;", IDS: "⿱日月", idsDataSource: "usource", irgSource: "UTC" },
        ],
    },
}

const read = (spec: { kind: string }) => {
    const result = inputs[spec.kind]
    if (!result) throw new Error(`unsupported read kind: ${spec.kind}`)
    return result
}

test("selects, unions, and describes explicit decomposition", () => {
    const loaded = evaluateIdsFlowRecipe({
        version: 1,
        datasets: {
            babelstone: { read: { kind: "babelstone" } },
            g: { select: { input: "babelstone", irg_source: "G" } },
            usource: { read: { kind: "usource" } },
            roots: { union: { inputs: ["g", "usource"] } },
            expanded: {
                decompose: {
                    input: "roots",
                    using: "g",
                    expand_z_variants: false,
                },
            },
        },
        output: "expanded",
    }, read)

    assert.equal(loaded.output.kind, "decompose")
    if (loaded.output.kind !== "decompose") return
    assert.deepEqual(loaded.output.roots, [
        inputs.babelstone.records[0],
        inputs.usource.records[0],
    ])
    assert.deepEqual(loaded.output.definitions, [inputs.babelstone.records[0]])
    assert.equal(loaded.output.expandZVariants, false)
    assert.equal(loaded.output.normalizeKdpvRadicalVariants, true)
    assert.deepEqual(loaded.dataSources, ["babelstone", "usource"])
    assert.deepEqual(loaded.queryPlan, {
        version: 1,
        transforms: [
            { op: "expand-overlaid", version: 1 },
            { op: "resolve-materialized-components", version: 1 },
        ],
    })
    assert.deepEqual(loaded.querySemantics, {
        mode: "registered",
        profile: "idsflow-decompose@1",
    })
})

test("allows records to remain unexpanded", () => {
    const loaded = evaluateIdsFlowRecipe({
        version: 1,
        datasets: { input: { read: { kind: "babelstone" } } },
        output: "input",
    }, read)
    assert.deepEqual(loaded.output, {
        kind: "records",
        records: inputs.babelstone.records,
    })
    assert.deepEqual(loaded.queryPlan, { version: 1, transforms: [] })
    assert.deepEqual(loaded.querySemantics, {
        mode: "registered",
        profile: "idsflow-records@1",
    })
})

test("rejects unknown keys and cyclic dataset references", () => {
    assert.throws(
        () => evaluateIdsFlowRecipe({
            version: 1,
            datasets: { input: { read: { kind: "babelstone", typo: true } } },
            output: "input",
        }, read),
        /unknown key: typo/,
    )
    assert.throws(
        () => evaluateIdsFlowRecipe({
            version: 1,
            datasets: {
                a: { union: { inputs: ["b"] } },
                b: { union: { inputs: ["a"] } },
            },
            output: "a",
        }, read),
        /cyclic dataset reference: a/,
    )
})
