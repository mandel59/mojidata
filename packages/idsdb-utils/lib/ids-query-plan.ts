import { expandOverlaid } from "./ids-operator"
import type { TokenList } from "./token-list"

export type IdsQueryTransform =
    | {
        op: "expand-overlaid"
        version: 1
    }
    | {
        op: "resolve-materialized-components"
        version: 1
    }

export type IdsQueryPlan = {
    version: 1
    transforms: IdsQueryTransform[]
}

export const identityIdsQueryPlan: IdsQueryPlan = {
    version: 1,
    transforms: [],
}

export const decomposedIdsQueryPlan: IdsQueryPlan = {
    version: 1,
    transforms: [
        { op: "expand-overlaid", version: 1 },
        { op: "resolve-materialized-components", version: 1 },
    ],
}

export const legacyIdsQueryPlan: IdsQueryPlan = {
    version: 1,
    transforms: [
        { op: "expand-overlaid", version: 1 },
        { op: "resolve-materialized-components", version: 1 },
    ],
}

export const idsQuerySemanticsProfiles = {
    records: "idsflow-records@1",
    decompose: "idsflow-decompose@1",
} as const

export type IdsQuerySemanticsProfile =
    typeof idsQuerySemanticsProfiles[keyof typeof idsQuerySemanticsProfiles]

export type IdsQuerySemanticsEvidenceGrade = "validated" | "verified"

export type IdsQuerySemanticsEvidenceReference = {
    kind: "differential" | "lean-theorem"
    locator: string
}

export type IdsQuerySemanticsEvidenceClaim = {
    claim: "abstract-match-preservation" | "production-search-correspondence"
    subject: string
    scope: string
    grade: IdsQuerySemanticsEvidenceGrade
    references: readonly IdsQuerySemanticsEvidenceReference[]
}

export type RegisteredIdsQuerySemantics = {
    plan: IdsQueryPlan
    evidence: readonly IdsQuerySemanticsEvidenceClaim[]
}

export type IdsQuerySemantics =
    | {
        mode: "registered"
        profile: IdsQuerySemanticsProfile
    }
    | {
        mode: "experimental"
        queryPlan: IdsQueryPlan
    }

const registeredIdsQuerySemantics: Record<
    IdsQuerySemanticsProfile,
    RegisteredIdsQuerySemantics
> = {
    [idsQuerySemanticsProfiles.records]: {
        plan: identityIdsQueryPlan,
        evidence: [
            {
                claim: "abstract-match-preservation",
                subject: "identity@1",
                scope: "complete-rooted-tree@1",
                grade: "verified",
                references: [{
                    kind: "lean-theorem",
                    locator: "IdsSearchVerify.Preserves.identity",
                }],
            },
            {
                claim: "production-search-correspondence",
                subject: idsQuerySemanticsProfiles.records,
                scope: "bounded-production-fixtures@1",
                grade: "validated",
                references: [{
                    kind: "differential",
                    locator: "packages/mojidata-api-bench/benchmarks/differential-idsflow-query-plan.ts",
                }],
            },
        ],
    },
    [idsQuerySemanticsProfiles.decompose]: {
        plan: decomposedIdsQueryPlan,
        evidence: [
            {
                claim: "abstract-match-preservation",
                subject: "expand-overlaid@1",
                scope: "complete-rooted-tree@1",
                grade: "verified",
                references: [{
                    kind: "lean-theorem",
                    locator: "IdsSearchVerify.expandOverlaid_preserves",
                }],
            },
            {
                claim: "abstract-match-preservation",
                subject: "resolve-materialized-components@1",
                scope: "complete-rooted-tree@1",
                grade: "verified",
                references: [{
                    kind: "lean-theorem",
                    locator: "IdsSearchVerify.resolvePatternAlternativeLists_preserves",
                }],
            },
            {
                claim: "abstract-match-preservation",
                subject: idsQuerySemanticsProfiles.decompose,
                scope: "complete-rooted-tree@1",
                grade: "verified",
                references: [{
                    kind: "lean-theorem",
                    locator: "IdsSearchVerify.decomposedRecipe_abstract_preserves",
                }],
            },
            {
                claim: "production-search-correspondence",
                subject: idsQuerySemanticsProfiles.decompose,
                scope: "bounded-production-fixtures@1",
                grade: "validated",
                references: [
                    {
                        kind: "differential",
                        locator: "packages/mojidata-api-bench/benchmarks/differential-idsflow-decomposed-search.ts",
                    },
                    {
                        kind: "differential",
                        locator: "packages/mojidata-api-bench/benchmarks/differential-idsflow-query-groups.ts",
                    },
                ],
            },
        ],
    },
}

export function getRegisteredIdsQuerySemantics(
    profile: unknown,
): RegisteredIdsQuerySemantics {
    if (
        profile === idsQuerySemanticsProfiles.records ||
        profile === idsQuerySemanticsProfiles.decompose
    ) {
        return registeredIdsQuerySemantics[profile]
    }
    throw new Error(`unsupported IDS query semantics profile: ${String(profile)}`)
}

export function getRegisteredIdsQueryPlan(
    profile: unknown,
): IdsQueryPlan {
    return getRegisteredIdsQuerySemantics(profile).plan
}

function mapping(value: unknown, at: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${at} must be a mapping`)
    }
    return value as Record<string, unknown>
}

function only(value: Record<string, unknown>, allowed: string[], at: string) {
    const unknown = Object.keys(value).find(key => !allowed.includes(key))
    if (unknown) throw new Error(`${at} has unknown key: ${unknown}`)
}

export function parseIdsQueryPlan(value: unknown): IdsQueryPlan {
    const plan = mapping(value, "query plan")
    only(plan, ["version", "transforms"], "query plan")
    if (plan.version !== 1) throw new Error("query plan.version must be 1")
    if (!Array.isArray(plan.transforms)) {
        throw new Error("query plan.transforms must be a list")
    }
    const transforms = plan.transforms.map((value, index): IdsQueryTransform => {
        const at = `query plan.transforms[${index}]`
        const transform = mapping(value, at)
        only(transform, ["op", "version"], at)
        if (transform.version !== 1) {
            throw new Error(`${at} is not a supported query transform`)
        }
        if (transform.op === "expand-overlaid") {
            return { op: "expand-overlaid", version: 1 }
        }
        if (transform.op === "resolve-materialized-components") {
            return { op: "resolve-materialized-components", version: 1 }
        }
        throw new Error(`${at} is not a supported query transform`)
    })
    return { version: 1, transforms }
}

export type CompiledIdsQueryPlan = {
    transformTokens: (tokens: TokenList) => TokenList[]
    resolveMaterializedComponents: boolean
}

export function compileIdsQueryPlan(
    plan: IdsQueryPlan,
): CompiledIdsQueryPlan {
    const tokenTransforms: Array<(tokens: TokenList) => TokenList[]> = []
    let resolveMaterializedComponents = false
    for (const transform of plan.transforms) {
        if (transform.op === "expand-overlaid" && transform.version === 1) {
            if (resolveMaterializedComponents) {
                throw new Error(
                    "expand-overlaid must precede resolve-materialized-components",
                )
            }
            tokenTransforms.push(expandOverlaid)
        } else if (
            transform.op === "resolve-materialized-components" &&
            transform.version === 1
        ) {
            if (resolveMaterializedComponents) {
                throw new Error(
                    "resolve-materialized-components must not be repeated",
                )
            }
            resolveMaterializedComponents = true
        }
    }
    return {
        transformTokens(tokens) {
            return tokenTransforms.reduce(
                (results, transform) => results.flatMap(transform),
                [tokens],
            )
        },
        resolveMaterializedComponents,
    }
}
