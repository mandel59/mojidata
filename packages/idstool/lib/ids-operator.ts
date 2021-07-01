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
    "@L": 1,
    "@R": 1,
    "@T": 1,
    "@B": 1,
    "@M": 1,
    "@I": 1,
    "@O": 1,
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
