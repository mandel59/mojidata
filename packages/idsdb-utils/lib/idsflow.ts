export type IdsFlowRecord = {
    char: string
    IDS: string
    idsDataSource: string
    irgSource: string | null
}

export type IdsFlowReport = {
    path: string
    sha256: string
    entries: number
    skipped: number
}

export type IdsFlowReadSpec = {
    kind: string
    path?: string
    dataSource?: string
}

export type IdsFlowReadResult = {
    records: IdsFlowRecord[]
    reports?: IdsFlowReport[]
}

type Records = {
    kind: "records"
    records: IdsFlowRecord[]
    reports: IdsFlowReport[]
}

type Decompose = {
    kind: "decompose"
    roots: IdsFlowRecord[]
    definitions: IdsFlowRecord[]
    reports: IdsFlowReport[]
    expandZVariants: boolean
    normalizeKdpvRadicalVariants: boolean
}

type Value = Records | Decompose
type Mapping = Record<string, unknown>

export type EvaluatedIdsFlow = {
    output: {
        kind: "records"
        records: IdsFlowRecord[]
    } | Omit<Decompose, "reports">
    dataSources: string[]
    reports: IdsFlowReport[]
}

export type IdsFlowReader = (
    spec: IdsFlowReadSpec,
    at: string,
) => IdsFlowReadResult

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

export function evaluateIdsFlowRecipe(
    recipeValue: unknown,
    read: IdsFlowReader,
): EvaluatedIdsFlow {
    const recipe = asMapping(recipeValue, "recipe")
    only(recipe, ["version", "datasets", "output"], "recipe")
    if (recipe.version !== 1) throw new Error("recipe.version must be 1")
    const nodes = asMapping(recipe.datasets, "recipe.datasets")
    if (Object.keys(nodes).length === 0) {
        throw new Error("recipe.datasets must not be empty")
    }
    const output = asString(recipe.output, "recipe.output")
    const memo = new Map<string, Value>()
    const active = new Set<string>()

    const records = (name: string, at: string): Records => {
        const value = evaluate(name)
        if (value.kind !== "records") {
            throw new Error(`${at} cannot use decomposed dataset ${name}`)
        }
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
            if (Object.keys(node).length !== 1) {
                throw new Error(`${at} must contain exactly one operation`)
            }

            let result: Value
            if (node.read !== undefined) {
                const opAt = `${at}.read`
                const op = asMapping(node.read, opAt)
                only(op, ["kind", "path", "data_source"], opAt)
                const loaded = read({
                    kind: asString(op.kind, `${opAt}.kind`),
                    path: op.path === undefined
                        ? undefined
                        : asString(op.path, `${opAt}.path`),
                    dataSource: op.data_source === undefined
                        ? undefined
                        : asString(op.data_source, `${opAt}.data_source`),
                }, opAt)
                result = {
                    kind: "records",
                    records: loaded.records,
                    reports: loaded.reports ?? [],
                }
            } else if (node.select !== undefined) {
                const opAt = `${at}.select`
                const op = asMapping(node.select, opAt)
                only(op, ["input", "irg_source"], opAt)
                const input = records(asString(op.input, `${opAt}.input`), at)
                const sources = new Set(asStrings(op.irg_source, `${opAt}.irg_source`))
                result = {
                    kind: "records",
                    records: input.records.filter(row =>
                        row.irgSource !== null && sources.has(row.irgSource)
                    ),
                    reports: input.reports,
                }
            } else if (node.union !== undefined) {
                const opAt = `${at}.union`
                const op = asMapping(node.union, opAt)
                only(op, ["inputs"], opAt)
                const inputs = asStrings(op.inputs, `${opAt}.inputs`)
                    .map(input => records(input, at))
                result = {
                    kind: "records",
                    records: inputs.flatMap(input => input.records),
                    reports: inputs.flatMap(input => input.reports),
                }
            } else {
                const opAt = `${at}.decompose`
                const op = asMapping(node.decompose, opAt)
                only(op, [
                    "input",
                    "using",
                    "expand_z_variants",
                    "normalize_kdpv_radical_variants",
                ], opAt)
                const inputName = asString(op.input, `${opAt}.input`)
                const roots = records(inputName, at)
                const definitions = records(
                    op.using === undefined
                        ? inputName
                        : asString(op.using, `${opAt}.using`),
                    at,
                )
                result = {
                    kind: "decompose",
                    roots: roots.records,
                    definitions: definitions.records,
                    reports: [...roots.reports, ...definitions.reports],
                    expandZVariants: bool(
                        op.expand_z_variants,
                        true,
                        `${opAt}.expand_z_variants`,
                    ),
                    normalizeKdpvRadicalVariants: bool(
                        op.normalize_kdpv_radical_variants,
                        true,
                        `${opAt}.normalize_kdpv_radical_variants`,
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
        reports: [...new Map(result.reports.map(report => [report.path, report])).values()],
    }
}
