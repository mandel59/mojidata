import { tokenArgs } from "./ids-operator"

export const idsFtsFeatureVersion = "mojidata-fts-features-v2"

export type IdsFtsFeatureFamily = "root" | "edge" | "equality"

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

function encodePath(path: readonly number[]) {
    return path.length === 0 ? "r" : path.join("")
}

export function encodeIdsFtsEqualityFeature(
    leftPath: readonly number[],
    rightPath: readonly number[],
) {
    return `mdf2q${encodePath(leftPath)}e${encodePath(rightPath)}`
}

/**
 * Compare IDS tree paths in the preorder used by equality feature storage.
 */
export function compareIdsTreePaths(
    left: readonly number[],
    right: readonly number[],
) {
    const commonLength = Math.min(left.length, right.length)
    for (let index = 0; index < commonLength; index++) {
        if (left[index] !== right[index]) return left[index] - right[index]
    }
    return left.length - right.length
}

/**
 * Return distinct IDS tree paths in the canonical storage orientation.
 */
export function canonicalizeIdsTreePaths(
    paths: readonly (readonly number[])[],
) {
    const unique = new Map<string, number[]>()
    for (const path of paths) {
        const key = path.join(",")
        if (!unique.has(key)) unique.set(key, [...path])
    }
    return [...unique.values()].sort(compareIdsTreePaths)
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

    const nodes: {
        path: number[]
        serialization: string
    }[] = []
    const visitNode = (
        index: number,
        path: number[],
    ): { next: number; complete: boolean } => {
        if (index >= tokens.length) return { next: index, complete: false }
        const parent = tokens[index]
        const arity = tokenArgs[parent] ?? 0
        let next = index + 1
        let complete = true
        for (let childIndex = 0; childIndex < arity; childIndex++) {
            if (next >= tokens.length) {
                complete = false
                break
            }
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
            const child = visitNode(next, [...path, childIndex])
            next = child.next
            complete &&= child.complete
        }
        if (complete) {
            nodes.push({
                path,
                serialization: tokens.slice(index, next).join(" "),
            })
        }
        return { next, complete }
    }

    let index = 0
    while (index < tokens.length) {
        const result = visitNode(index, [])
        if (result.next <= index) break
        index = result.next
    }

    if (families.has("equality")) {
        const pathsBySerialization = new Map<string, number[][]>()
        for (const node of nodes) {
            const paths = pathsBySerialization.get(node.serialization) ?? []
            paths.push(node.path)
            pathsBySerialization.set(node.serialization, paths)
        }
        for (const paths of pathsBySerialization.values()) {
            const canonicalPaths = canonicalizeIdsTreePaths(paths)
            for (let left = 0; left < canonicalPaths.length; left++) {
                for (
                    let right = left + 1;
                    right < canonicalPaths.length;
                    right++
                ) {
                    features.add(
                        encodeIdsFtsEqualityFeature(
                            canonicalPaths[left],
                            canonicalPaths[right],
                        ),
                    )
                }
            }
        }
    }
    return [...features]
}
