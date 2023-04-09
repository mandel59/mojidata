export const tokenArgs: Partial<Record<string, number>> = {
    "〾": 1,
    "⿰": 2,
    "⿱": 2,
    "⿲": 3,
    "⿳": 3,
    "⿴": 2,
    "⿵": 2,
    "⿶": 2,
    "⿷": 2,
    "⿸": 2,
    "⿹": 2,
    "⿺": 2,
    "⿻": 2,
    "↔": 1,
    "↷": 1,
    "⊖": 2,
    "@L": 1,
    "@R": 1,
    "@T": 1,
    "@B": 1,
    "@M": 1,
    "@I": 1,
    "@O": 1,
    // overlaid operator ⿻ with a hidden argument
    "&OL3;": 3,
}

export function nodeLength(tokens: string[], i: number) {
    let j = i
    let argCount = 1
    while (argCount > 0) {
        const token = tokens[j++]
        argCount += (tokenArgs[token] ?? 0) - 1
    }
    return j - i
}

export function parseArgs(tokens: string[]) {
    const t = tokens[0]
    const lenArgs = tokenArgs[t] ?? 0
    const args: string[][] = []
    let s = 1
    for (let i = 0; i < lenArgs; i++) {
        const l = nodeLength(tokens, s)
        args.push(tokens.slice(s, s + l))
        s += l
    }
    return args
}

function isSurrounding(obj: string) {
    return (obj === "⿴"
        || obj === "⿵"
        || obj === "⿶"
        || obj === "⿷"
        || obj === "⿸"
        || obj === "⿹"
        || obj === "⿺")
}

export function* applyOperators(tokens: string[]): Generator<string, any, undefined> {
    if (tokens.length === 0) return
    let i = 0
    while (i < tokens.length) {
        const t = tokens[i]
        if (t[0] === "@" && t in tokenArgs) {
            const len = nodeLength(tokens, i + 1)
            const subtokens = Array.from(applyOperators(tokens.slice(i + 1, i + 1 + len)))
            const args = parseArgs(subtokens)
            const obj = subtokens[0]
            if (t === "@L" && obj === "⿰") yield* args[0]
            else if (t === "@R" && obj === "⿰") yield* args[1]
            else if (t === "@L" && obj === "⿲") yield* args[0]
            else if (t === "@M" && obj === "⿲") yield* args[1]
            else if (t === "@R" && obj === "⿲") yield* args[2]
            else if (t === "@T" && obj === "⿱") yield* args[0]
            else if (t === "@B" && obj === "⿱") yield* args[1]
            else if (t === "@T" && obj === "⿳") yield* args[0]
            else if (t === "@M" && obj === "⿳") yield* args[1]
            else if (t === "@B" && obj === "⿳") yield* args[2]
            else if (t === "@O" && isSurrounding(obj)) yield* args[0]
            else if (t === "@I" && isSurrounding(obj)) yield* args[1]
            else throw new Error("IDS operator is not applicable")
            i += len + 1
        } else {
            yield t
            i += 1
        }
    }
}

/**
 * Normalize arguments of character overlaid operator.
 * 
 * Character overlaid operator is commutative; i.e. ⿻XY ≡ ⿻YX.
 * This method normalize ⿻YX into ⿻XY if X < Y.
 *
 * This method is destructive.
 * @param tokens
 * @returns processed tokens (the same as input)
 */
export function normalizeOverlaid(tokens: string[]): string[] {
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i] === "⿻") {
            // compare subtokens
            if (i + 1 >= tokens.length) {
                continue
            }
            const l1 = nodeLength(tokens, i + 1)
            if (i + 1 + l1 >= tokens.length) {
                continue
            }
            const l2 = nodeLength(tokens, i + 1 + l1)
            if (i + 1 + l1 + l2 > tokens.length) {
                continue
            }
            if (l1 < l2) {
                continue
            }
            const s1 = tokens.slice(i + 1, i + 1 + l1)
            const s2 = tokens.slice(i + 1 + l1, i + 1 + l1 + l2)
            if (l1 === l2 && s1.join("") <= s2.join("")) {
                continue
            }
            if (s1.includes("？") || s2.includes("？")) {
                continue
            }
            // swap args
            for (let k = 0; k < l2; k++) {
                tokens[i + 1 + k] = s2[k]
            }
            for (let k = 0; k < l1; k++) {
                tokens[i + 1 + l2 + k] = s1[k]
            }
        }
    }
    return tokens
}

function* _expandOverlaid(tokens: string[]): Generator<string[], void> {
    if (tokens.length < 2) {
        yield tokens
        return
    }
    const t0 = tokens[0]
    if (t0 !== "⿻") {
        for (const rest of _expandOverlaid(tokens.slice(1))) {
            yield [t0, ...rest]
        }
        return
    }
    for (const rest of _expandOverlaid(tokens.slice(1))) {
        const tokens = ["&OL3;", "？", ...rest]
        const l1 = nodeLength(rest, 0)
        if (l1 >= rest.length) {
            yield tokens
            continue
        }
        const l2 = nodeLength(rest, l1)
        if (l1 + l2 > rest.length) {
            yield tokens
            continue
        }
        const s1 = rest.slice(0, l1)
        const s2 = rest.slice(l1, l1 + l2)
        const s3 = rest.slice(l1 + l2)
        const tokensSwitched = ["&OL3;", "？", ...s2, ...s1, ...s3]
        yield tokens
        yield tokensSwitched
    }
}

export function expandOverlaid(tokens: string[]): string[][] {
    return [..._expandOverlaid(tokens)]
}
