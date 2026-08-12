import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, test } from "node:test"
import { DatabaseSync } from "node:sqlite"

import {
    IDSDecomposer,
    IDSDecompositionCycleError,
} from "../node"

type IdsRow = readonly [ucs: string, source: string, ids: string]

const tempDirectories: string[] = []
afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

function fixture(rows: IdsRow[], zVariants: readonly [string, string][] = []) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ids-decomposer-cycle-"))
    tempDirectories.push(directory)
    const dbPath = path.join(directory, "moji.db")
    const db = new DatabaseSync(dbPath)
    db.exec(`
        CREATE TABLE ids (UCS TEXT, source TEXT, IDS TEXT);
        CREATE TABLE unihan_kZVariant (UCS TEXT, value TEXT);
    `)
    const insertIds = db.prepare("INSERT INTO ids VALUES (?, ?, ?)")
    for (const row of rows) insertIds.run(...row)
    const insertVariant = db.prepare("INSERT INTO unihan_kZVariant VALUES (?, ?)")
    for (const [ucs, variant] of zVariants) {
        insertVariant.run(
            ucs,
            `U+${variant.codePointAt(0)!.toString(16).toUpperCase()}`,
        )
    }
    db.close()
    return dbPath
}

async function expectCycle(
    rows: IdsRow[],
    expectedPath: string,
    options: { zVariants?: readonly [string, string][] } = {},
) {
    await assert.rejects(
        IDSDecomposer.create({
            mojidb: fixture(rows, options.zVariants),
            expandZVariants: (options.zVariants?.length ?? 0) > 0,
        }),
        error => {
            assert.ok(error instanceof IDSDecompositionCycleError)
            assert.match(error.message, new RegExp(expectedPath))
            assert.ok(error.witness.every(step =>
                step.idsTokens.length > 0 && step.selectedSource.length > 0,
            ))
            return true
        },
    )
}

describe("IDS decomposition cycle preflight", () => {
    test("keeps a sole atomic self-definition terminal", async () => {
        const decomposer = await IDSDecomposer.create({
            mojidb: fixture([["甲", "G", "甲"]]),
        })
        assert.deepEqual([...decomposer.decomposeAll("甲", "G")], [["甲"]])
        decomposer.close()
    })

    test("rejects a structural direct self-reference", async () => {
        await expectCycle(
            [["甲", "G", "⿰甲日"]],
            "甲@G -> 甲@G",
        )
    })

    test("rejects an indirect cycle", async () => {
        await expectCycle(
            [
                ["甲", "G", "⿰乙日"],
                ["乙", "G", "⿱甲月"],
            ],
            "甲@G -> 乙@G -> 甲@G",
        )
    })

    test("rejects a fallback-induced cycle and records the selected source", async () => {
        await assert.rejects(
            IDSDecomposer.create({
                mojidb: fixture([
                    ["甲", "J", "⿰乙日"],
                    ["乙", "G", "⿱甲月"],
                ]),
            }),
            error => {
                assert.ok(error instanceof IDSDecompositionCycleError)
                assert.match(error.message, /甲@J -> 乙@J -> 甲@J/)
                assert.equal(error.witness[1].selectedSource, "G")
                return true
            },
        )
    })

    test("rejects a variant-induced cycle", async () => {
        await expectCycle(
            [
                ["甲", "G", "甲"],
                ["乙", "G", "⿰甲日"],
            ],
            "甲@G -> 甲@G",
            { zVariants: [["甲", "乙"]] },
        )
    })

    test("rejects a productive cycle even when an atomic alternative exists", async () => {
        await expectCycle(
            [
                ["甲", "G", "甲"],
                ["甲", "G", "⿰甲日"],
            ],
            "甲@G -> 甲@G",
        )
    })
})
