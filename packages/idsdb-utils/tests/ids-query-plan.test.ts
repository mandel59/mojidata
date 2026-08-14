import assert from "node:assert/strict"
import test from "node:test"

import {
    compileIdsQueryPlan,
    decomposedIdsQueryPlan,
    identityIdsQueryPlan,
    legacyIdsQueryPlan,
    parseIdsQueryPlan,
    tokenizeIDS,
} from "../index"

test("compiles syntax and resolution stages", () => {
    const identity = compileIdsQueryPlan(identityIdsQueryPlan)
    assert.deepEqual(
        identity.transformTokens(tokenizeIDS("⿻日丨")).map((tokens) => [
            ...tokens,
        ]),
        [["⿻", "日", "丨"]],
    )
    assert.equal(identity.resolveMaterializedComponents, false)

    const decomposed = compileIdsQueryPlan(decomposedIdsQueryPlan)
    assert.deepEqual(
        decomposed.transformTokens(tokenizeIDS("⿻日丨")).map((tokens) => [
            ...tokens,
        ]),
        [
            ["&OL3;", "？", "日", "丨"],
            ["&OL3;", "？", "丨", "日"],
        ],
    )
    assert.equal(decomposed.resolveMaterializedComponents, true)
})

test("keeps the legacy database plan explicit", () => {
    assert.deepEqual(legacyIdsQueryPlan, {
        version: 1,
        transforms: [
            { op: "expand-overlaid", version: 1 },
            { op: "resolve-materialized-components", version: 1 },
        ],
    })
})

test("parses materialized resolution and rejects invalid stage order", () => {
    assert.deepEqual(parseIdsQueryPlan({
        version: 1,
        transforms: [{ op: "resolve-materialized-components", version: 1 }],
    }), {
        version: 1,
        transforms: [{ op: "resolve-materialized-components", version: 1 }],
    })
    assert.throws(
        () => compileIdsQueryPlan({
            version: 1,
            transforms: [
                { op: "resolve-materialized-components", version: 1 },
                { op: "expand-overlaid", version: 1 },
            ],
        }),
        /must precede/,
    )
    assert.throws(
        () => compileIdsQueryPlan({
            version: 1,
            transforms: [
                { op: "resolve-materialized-components", version: 1 },
                { op: "resolve-materialized-components", version: 1 },
            ],
        }),
        /must not be repeated/,
    )
})
