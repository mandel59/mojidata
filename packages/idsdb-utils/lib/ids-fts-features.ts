import { tokenArgs } from "./ids-operator"

export const idsFtsFeatureVersion = "mojidata-fts-features-v1"

export type IdsFtsFeatureFamily = "root" | "edge"

type FeatureOptions = {
    families: readonly IdsFtsFeatureFamily[]
    includeToken?: (token: string) => boolean
}

function encodeToken(token: string) {
    return Array.from(token, character => character.codePointAt(0)!.toString(16)).join("x")
}

export function encodeIdsFtsRootFeature(token: string) {
    return `mdf1r${encodeToken(token)}`
}

export function encodeIdsFtsEdgeFeature(
    parent: string,
    childIndex: number,
    childRoot: string,
) {
    return `mdf1e${encodeToken(parent)}p${childIndex}c${encodeToken(childRoot)}`
}

/**
 * Extract collision-free root and local-edge terms from a prefix IDS forest.
 *
 * Incomplete final nodes are accepted. Only relationships whose child root is
 * present in the token stream are emitted.
 */
export function collectIdsFtsFeatures(
    tokens: readonly string[],
    options: FeatureOptions,
) {
    const families = new Set(options.families)
    const includeToken = options.includeToken ?? (() => true)
    const features = new Set<string>()

    if (families.has("root") && tokens.length > 0 && includeToken(tokens[0])) {
        features.add(encodeIdsFtsRootFeature(tokens[0]))
    }

    const visitNode = (index: number): number => {
        if (index >= tokens.length) return index
        const parent = tokens[index]
        const arity = tokenArgs[parent] ?? 0
        let next = index + 1
        for (let childIndex = 0; childIndex < arity; childIndex++) {
            if (next >= tokens.length) break
            const childRoot = tokens[next]
            if (
                families.has("edge") &&
                includeToken(parent) &&
                includeToken(childRoot)
            ) {
                features.add(
                    encodeIdsFtsEdgeFeature(parent, childIndex, childRoot),
                )
            }
            next = visitNode(next)
        }
        return next
    }

    let index = 0
    while (index < tokens.length) {
        const next = visitNode(index)
        if (next <= index) break
        index = next
    }
    return [...features]
}
