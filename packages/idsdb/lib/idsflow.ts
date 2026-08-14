import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import Database from "better-sqlite3"
import YAML from "yaml"
import { parseBabelStoneIdsSourceExpression } from "@mandel59/idsdb-utils"
import { convertEidsDictionary } from "./eids"

export type IdsFlowRecord = {
    char: string
    IDS: string
    idsDataSource: string
    irgSource: string | null
}

type Report = { path: string, sha256: string, entries: number, skipped: number }
type Records = { kind: "records", records: IdsFlowRecord[], reports: Report[] }
type Decompose = {
    kind: "decompose"
    roots: IdsFlowRecord[]
    definitions: IdsFlowRecord[]
    reports: Report[]
    expandZVariants: boolean
    normalizeKdpvRadicalVariants: boolean
}
type Value = Records | Decompose
type Mapping = Record<string, unknown>

export type LoadedIdsFlow = {
    output: {
        kind: "records"
        records: IdsFlowRecord[]
    } | Omit<Decompose, "reports">
    dataSources: string[]
    eidsReports: Report[]
    recipePath: string
    recipeSha256: string
}

function asMapping(value: unknown, at: string): Mapping {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${at} must be a mapping`)
    }
    return value as Mapping
}

function only(value: Mapping, allowed: string[], at: string) {
    const unknown = Object.keys(value).find(key => !allowed.includes(key))
    if (unknown) throw new Error(`${at} has unknown key: ${unknown}`)
}

function asString(value: unknown, at: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${at} must be a non-empty string`)
    }
    return value
}

function asStrings(value: unknown, at: string): string[] {
    const values = typeof value === "string" ? [value] : value
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`${at} must be a string or a non-empty string list`)
    }
    return values.map((item, index) => asString(item, `${at}[${index}]`))
}

function bool(value: unknown, fallback: boolean, at: string) {
    if (value === undefined) return fallback
    if (typeof value !== "boolean") throw new Error(`${at} must be a boolean`)
    return value
}

function resolvePath(base: string, value: unknown, fallback?: string) {
    const name = value === undefined ? fallback : asString(value, "read.path")
    if (!name) throw new Error("read.path is required")
    return path.resolve(base, name)
}

function readIds(dbPath: string): IdsFlowRecord[] {
    const db = new Database(dbPath, { readonly: true })
    try {
        const result: IdsFlowRecord[] = []
        for (const row of db.prepare("SELECT UCS, source, IDS FROM ids").iterate() as Iterable<{
            UCS: string, source: string, IDS: string
        }>) {
            for (const irgSource of parseBabelStoneIdsSourceExpression(row.source)) {
                result.push({
                    char: row.UCS, IDS: row.IDS,
                    idsDataSource: "babelstone", irgSource,
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
            char: `&${row.U_source_ID};`, IDS: row.IDS,
            idsDataSource: "usource", irgSource: "UTC",
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
    const recipe = asMapping(YAML.parse(text), "recipe")
    only(recipe, ["version", "datasets", "output"], "recipe")
    if (recipe.version !== 1) throw new Error("recipe.version must be 1")
    const nodes = asMapping(recipe.datasets, "recipe.datasets")
    if (Object.keys(nodes).length === 0) throw new Error("recipe.datasets must not be empty")
    const output = asString(recipe.output, "recipe.output")
    const base = path.dirname(recipePath)
    const memo = new Map<string, Value>()
    const active = new Set<string>()

    const records = (name: string, at: string): Records => {
        const value = evaluate(name)
        if (value.kind !== "records") throw new Error(`${at} cannot use decomposed dataset ${name}`)
        return value
    }

    const evaluate = (name: string): Value => {
        const cached = memo.get(name)
        if (cached) return cached
        if (nodes[name] === undefined) throw new Error(`unknown dataset: ${name}`)
        if (active.has(name)) throw new Error(`cyclic dataset reference: ${name}`)
        active.add(name)
        try {
            const at = `datasets.${name}`
            const node = asMapping(nodes[name], at)
            only(node, ["read", "select", "union", "decompose"], at)
            if (Object.keys(node).length !== 1) throw new Error(`${at} must contain exactly one operation`)
            let result: Value
            if (node.read !== undefined) {
                const read = asMapping(node.read, `${at}.read`)
                only(read, ["kind", "path", "data_source"], `${at}.read`)
                const kind = asString(read.kind, `${at}.read.kind`)
                if (kind === "moji-ids" || kind === "moji-usource") {
                    if (read.data_source !== undefined) {
                        throw new Error(`${at}.read.data_source is fixed for ${kind}`)
                    }
                    const dbPath = resolvePath(base, read.path, options.defaultMojidb)
                    result = {
                        kind: "records",
                        records: kind === "moji-ids" ? readIds(dbPath) : readUsource(dbPath),
                        reports: [],
                    }
                } else if (kind === "eids") {
                    const filePath = resolvePath(base, read.path)
                    const input = fs.readFileSync(filePath, "utf8")
                    const converted = convertEidsDictionary(input)
                    const dataSource = read.data_source === undefined
                        ? "eids" : asString(read.data_source, `${at}.read.data_source`)
                    result = {
                        kind: "records",
                        records: converted.entries.map(row => ({
                            char: row.UCS, IDS: row.IDS,
                            idsDataSource: dataSource, irgSource: null,
                        })),
                        reports: [{
                            path: filePath,
                            sha256: createHash("sha256").update(input).digest("hex"),
                            entries: converted.entries.length,
                            skipped: converted.skipped.missingOrUnsupportedHead +
                                converted.skipped.unsupportedTree,
                        }],
                    }
                } else {
                    throw new Error(`unsupported read kind: ${kind}`)
                }
            } else if (node.select !== undefined) {
                const op = asMapping(node.select, `${at}.select`)
                only(op, ["input", "irg_source"], `${at}.select`)
                const input = records(asString(op.input, `${at}.select.input`), at)
                const sources = new Set(asStrings(op.irg_source, `${at}.select.irg_source`))
                result = {
                    kind: "records",
                    records: input.records.filter(row =>
                        row.irgSource !== null && sources.has(row.irgSource)
                    ),
                    reports: input.reports,
                }
            } else if (node.union !== undefined) {
                const op = asMapping(node.union, `${at}.union`)
                only(op, ["inputs"], `${at}.union`)
                const inputs = asStrings(op.inputs, `${at}.union.inputs`)
                    .map(input => records(input, at))
                result = {
                    kind: "records",
                    records: inputs.flatMap(input => input.records),
                    reports: inputs.flatMap(input => input.reports),
                }
            } else {
                const op = asMapping(node.decompose, `${at}.decompose`)
                only(op, [
                    "input", "using", "expand_z_variants",
                    "normalize_kdpv_radical_variants",
                ], `${at}.decompose`)
                const inputName = asString(op.input, `${at}.decompose.input`)
                const roots = records(inputName, at)
                const definitions = records(
                    op.using === undefined ? inputName : asString(op.using, `${at}.decompose.using`),
                    at,
                )
                result = {
                    kind: "decompose",
                    roots: roots.records,
                    definitions: definitions.records,
                    reports: [...roots.reports, ...definitions.reports],
                    expandZVariants: bool(op.expand_z_variants, true, `${at}.decompose.expand_z_variants`),
                    normalizeKdpvRadicalVariants: bool(
                        op.normalize_kdpv_radical_variants, true,
                        `${at}.decompose.normalize_kdpv_radical_variants`,
                    ),
                }
            }
            memo.set(name, result)
            return result
        } finally {
            active.delete(name)
        }
    }

    const result = evaluate(output)
    const outputRecords = result.kind === "records" ? result.records : result.roots
    return {
        output: result.kind === "records"
            ? { kind: "records", records: result.records }
            : {
                kind: "decompose",
                roots: result.roots,
                definitions: result.definitions,
                expandZVariants: result.expandZVariants,
                normalizeKdpvRadicalVariants: result.normalizeKdpvRadicalVariants,
            },
        dataSources: [...new Set(outputRecords.map(row => row.idsDataSource))],
        eidsReports: [...new Map(result.reports.map(report => [report.path, report])).values()],
        recipePath,
        recipeSha256: createHash("sha256").update(text).digest("hex"),
    }
}
