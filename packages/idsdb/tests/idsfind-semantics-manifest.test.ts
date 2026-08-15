import assert from "node:assert/strict"
import test from "node:test"
import Database from "better-sqlite3"
import { writeIdsfindSemanticsManifest } from "../lib/idsfind-semantics-manifest"

test("writes registered and experimental schema 3 manifests", () => {
    const registered = new Database(":memory:")
    try {
        writeIdsfindSemanticsManifest(registered, {
            mode: "registered",
            profile: "idsflow-decompose@1",
        }, "a".repeat(64))
        assert.deepEqual(
            registered.prepare("SELECT * FROM idsfind_semantics").get(),
            {
                schema_version: 3,
                semantics_mode: "registered",
                semantics_profile: "idsflow-decompose@1",
                query_plan_json: null,
                recipe_sha256: "a".repeat(64),
            },
        )
    } finally {
        registered.close()
    }

    const experimental = new Database(":memory:")
    try {
        writeIdsfindSemanticsManifest(experimental, {
            mode: "experimental",
            queryPlan: {
                version: 1,
                transforms: [
                    { op: "resolve-materialized-components", version: 1 },
                ],
            },
        }, null)
        assert.deepEqual(
            experimental.prepare("SELECT * FROM idsfind_semantics").get(),
            {
                schema_version: 3,
                semantics_mode: "experimental",
                semantics_profile: null,
                query_plan_json: JSON.stringify({
                    version: 1,
                    transforms: [
                        { op: "resolve-materialized-components", version: 1 },
                    ],
                }),
                recipe_sha256: null,
            },
        )
    } finally {
        experimental.close()
    }
})
