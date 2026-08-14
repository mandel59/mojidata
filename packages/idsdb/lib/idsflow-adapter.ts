import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import YAML from "yaml"
import {
    evaluateIdsFlowRecipe,
    parseIdsFlowRecordsJsonl,
    parseBabelStoneIdsSourceExpression,
    type EvaluatedIdsFlow,
    type IdsFlowReadSpec,
    type IdsFlowRecord,
    type IdsFlowReport,
} from "@mandel59/idsdb-utils"

export type LoadedIdsFlow = Omit<EvaluatedIdsFlow, "reports"> & {
    inputReports: IdsFlowReport[]
    recipePath: string
    recipeSha256: string
}

function resolveInputPath(
    base: string,
    value: string | undefined,
    fallback: string | undefined,
    at: string,
) {
    const name = value ?? fallback
    if (!name) throw new Error(`${at}.path is required`)
    return path.resolve(base, name)
}

function readIds(dbPath: string): IdsFlowRecord[] {
    const db = new Database(dbPath, { readonly: true })
    try {
        const result: IdsFlowRecord[] = []
        for (const row of db.prepare("SELECT UCS, source, IDS FROM ids").iterate() as Iterable<{
            UCS: string
            source: string
            IDS: string
        }>) {
            for (const irgSource of parseBabelStoneIdsSourceExpression(row.source)) {
                result.push({
                    char: row.UCS,
                    IDS: row.IDS,
                    idsDataSource: "babelstone",
                    irgSource,
                })
            }
        }
        return result
    } finally {
        db.close()
    }
}

function readUsource(dbPath: string): IdsFlowRecord[] {
    const db = new Database(dbPath, { readonly: true })
    try {
        return (db.prepare(
            "SELECT U_source_ID, IDS FROM usource WHERE IDS IS NOT NULL",
        ).all() as { U_source_ID: string, IDS: string }[]).map(row => ({
            char: `&${row.U_source_ID};`,
            IDS: row.IDS,
            idsDataSource: "usource",
            irgSource: "UTC",
        }))
    } finally {
        db.close()
    }
}

export function loadIdsFlowRecipe(
    recipePath: string,
    options: { defaultMojidb: string },
): LoadedIdsFlow {
    recipePath = path.resolve(recipePath)
    const text = fs.readFileSync(recipePath, "utf8")
    const base = path.dirname(recipePath)
    const evaluated = evaluateIdsFlowRecipe(
        YAML.parse(text),
        (spec: IdsFlowReadSpec, at: string) => {
            if (spec.kind === "moji-ids" || spec.kind === "moji-usource") {
                if (spec.dataSource !== undefined) {
                    throw new Error(`${at}.data_source is fixed for ${spec.kind}`)
                }
                const dbPath = resolveInputPath(
                    base,
                    spec.path,
                    options.defaultMojidb,
                    at,
                )
                return {
                    records: spec.kind === "moji-ids"
                        ? readIds(dbPath)
                        : readUsource(dbPath),
                }
            }
            if (spec.kind === "records-jsonl") {
                if (spec.dataSource !== undefined) {
                    throw new Error(`${at}.data_source is stored in records-jsonl`)
                }
                const filePath = resolveInputPath(base, spec.path, undefined, at)
                const input = fs.readFileSync(filePath, "utf8")
                const parsed = parseIdsFlowRecordsJsonl(input)
                return {
                    records: parsed.records,
                    reports: [{
                        path: filePath,
                        sha256: createHash("sha256").update(input).digest("hex"),
                        entries: parsed.records.length,
                        skipped: parsed.skipped,
                    }],
                }
            }
            throw new Error(`unsupported read kind: ${spec.kind}`)
        },
    )
    return {
        output: evaluated.output,
        dataSources: evaluated.dataSources,
        inputReports: evaluated.reports,
        recipePath,
        recipeSha256: createHash("sha256").update(text).digest("hex"),
    }
}
