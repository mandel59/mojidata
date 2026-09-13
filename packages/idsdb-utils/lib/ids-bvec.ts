import { tokenArgs } from "./ids-operator"

export const idsBvecFeatureVersion = "mojidata-bvec-v1"
export const idsBvecWordCount = 4
export const idsBvecRecordBytes = idsBvecWordCount * 4

export type IdsBvec = readonly [number, number, number, number]
export type IdsBvecPattern = {
    vector: IdsBvec
    rootCount: number
}

function utf8Bytes(value: string) {
    return new TextEncoder().encode(value)
}

function fnv1a32(value: string, bump: boolean) {
    let hash = bump ? 84696351 : 2166136261
    for (const byte of utf8Bytes(value)) {
        hash = Math.imul((hash ^ byte) >>> 0, 16777619) >>> 0
    }
    return hash
}

function bloomBits(hash: number) {
    let value = hash >>> 0
    let bits = 0
    for (let i = 0; i < 3; i++) {
        bits = (bits | (1 << (value & 31))) >>> 0
        value = (Math.imul(value ^ (value >>> 16), 0x45d9f3b) + 0x9e3779b9) >>> 0
    }
    return bits >>> 0
}

export function idsBvecTokenMask(token: string) {
    const arity = tokenArgs[token]
    const hash = arity === undefined
        ? fnv1a32(token, false)
        : (fnv1a32(token, true) + Math.imul(1108378657, arity)) >>> 0
    return bloomBits(hash)
}

function childWord(parentWord: number, childIndex: number, arity: number) {
    if (parentWord !== 0) return 3
    if (childIndex === 0) return 1
    if (childIndex === arity - 1) return 2
    return 3
}

/**
 * Encode a prefix IDS forest as an IDSgrep-inspired 128-bit vector.
 *
 * The four words describe the root, first child, last child, and all remaining
 * or deeper nodes. Hashing is defined by `idsBvecFeatureVersion`; this format is
 * intentionally not claimed to be byte-compatible with IDSgrep.
 */
export function encodeIdsBvec(tokens: readonly string[]): IdsBvec {
    const words = [0, 0, 0, 0]

    const encodeNode = (index: number, word: number): number => {
        if (index >= tokens.length) {
            return index
        }
        const token = tokens[index]
        const arity = tokenArgs[token] ?? 0
        words[word] = (words[word] | idsBvecTokenMask(token)) >>> 0
        let next = index + 1
        for (let child = 0; child < arity; child++) {
            next = encodeNode(next, childWord(word, child, arity))
        }
        return next
    }

    if (tokens.length === 0) throw new Error("Empty IDS token sequence")
    let index = 0
    let root = 0
    while (index < tokens.length) {
        index = encodeNode(index, root === 0 ? 0 : 3)
        root++
    }
    return words as [number, number, number, number]
}

/** Encode the positive features of a query pattern, omitting wildcard nodes. */
export function encodeIdsBvecPattern(
    tokens: readonly string[],
    rootWord: 0 | 1 | 2 | 3 = 0,
): IdsBvecPattern {
    const words = [0, 0, 0, 0]

    const encodeNode = (
        index: number,
        word: number,
    ): { next: number; complete: boolean } => {
        if (index >= tokens.length) return { next: index, complete: false }
        const token = tokens[index]
        if (token === "？" || /^[a-zａ-ｚ]$/u.test(token)) {
            return { next: index + 1, complete: true }
        }
        const arity = tokenArgs[token] ?? 0
        words[word] = (words[word] | idsBvecTokenMask(token)) >>> 0
        let next = index + 1
        for (let child = 0; child < arity; child++) {
            const result = encodeNode(next, childWord(word, child, arity))
            next = result.next
            if (!result.complete) return { next, complete: false }
        }
        return { next, complete: true }
    }

    let index = 0
    let rootCount = 0
    while (index < tokens.length) {
        const result = encodeNode(index, rootCount === 0 ? rootWord : 3)
        index = result.next
        rootCount++
        if (!result.complete) break
    }
    return {
        vector: words as [number, number, number, number],
        rootCount,
    }
}

export function idsBvecUnion(vector: IdsBvec) {
    return (vector[0] | vector[1] | vector[2] | vector[3]) >>> 0
}

export function idsBvecContainsMask(vector: IdsBvec, mask: number) {
    return ((idsBvecUnion(vector) & mask) >>> 0) === (mask >>> 0)
}
