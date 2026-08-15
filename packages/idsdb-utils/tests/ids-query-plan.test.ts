import assert from "node:assert/strict"
import test from "node:test"

import {
    compileIdsQueryPlan,
    decomposedIdsQueryPlan,
    getRegisteredIdsQueryPlan,
    getRegisteredIdsQuerySemantics,
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

test("describes evidence per claim without promoting a whole profile", () => {
    const records = getRegisteredIdsQuerySemantics("idsflow-records@1")
    assert.equal(records.plan, identityIdsQueryPlan)
    assert.deepEqual(
        records.evidence.map(({ claim, subject, grade }) => ({
            claim,
            subject,
            grade,
        })),
        [
            {
                claim: "abstract-match-preservation",
                subject: "identity@1",
                grade: "verified",
            },
            {
                claim: "production-search-correspondence",
                subject: "idsflow-records@1",
                grade: "validated",
            },
        ],
    )

    const decompose = getRegisteredIdsQuerySemantics("idsflow-decompose@1")
    assert.equal(decompose.plan, decomposedIdsQueryPlan)
    assert.deepEqual(
        decompose.evidence.map(({ claim, subject, grade }) => ({
            claim,
            subject,
            grade,
        })),
        [
            {
                claim: "abstract-match-preservation",
                subject: "expand-overlaid@1",
                grade: "verified",
            },
            {
                claim: "abstract-match-preservation",
                subject: "resolve-materialized-components@1",
                grade: "verified",
            },
            {
                claim: "abstract-match-preservation",
                subject: "idsflow-decompose@1",
                grade: "verified",
            },
            {
                claim: "production-search-correspondence",
                subject: "idsflow-decompose@1",
                grade: "validated",
            },
        ],
    )
    assert.deepEqual(
        decompose.evidence.flatMap(({ references }) => references)
            .filter(({ kind }) => kind === "lean-theorem")
            .map(({ locator }) => locator),
        [
            "IdsSearchVerify.expandOverlaid_preserves",
            "IdsSearchVerify.resolvePatternAlternativeLists_preserves",
            "IdsSearchVerify.decomposedRecipe_abstract_preserves",
        ],
    )
})

test("maps only registered semantics profiles to query plans", () => {
    assert.equal(
        getRegisteredIdsQueryPlan("idsflow-records@1"),
        identityIdsQueryPlan,
    )
    assert.equal(
        getRegisteredIdsQueryPlan("idsflow-decompose@1"),
        decomposedIdsQueryPlan,
    )
    assert.throws(
        () => getRegisteredIdsQueryPlan("future-profile@1"),
        /unsupported IDS query semantics profile/,
    )
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
