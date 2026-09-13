const canonicalSource = new Map<string, string>([
    ["G", "G"],
    ["H", "H"],
    ["J", "J"],
    ["K", "K"],
    ["P", "KP"],
    ["KP", "KP"],
    ["M", "M"],
    ["MY", "MY"],
    ["S", "SAT"],
    ["SAT", "SAT"],
    ["SG", "SG"],
    ["T", "T"],
    ["B", "UK"],
    ["UK", "UK"],
    ["U", "UTC"],
    ["UTC", "UTC"],
    ["V", "V"],
    // BabelStone-specific glyph contexts, not IRG source prefix bases.
    ["UCS2003", "UCS2003"],
    ["X", "X"],
    ["Z", "Z"],
])

export const idsdbSourceTokens = [
    "G", "H", "J", "K", "KP", "M", "MY", "SAT", "SG", "T", "UK", "UTC", "V",
    "X", "Z", "UCS2003",
] as const

// Longest first so canonical multi-character bases remain atomic when they
// start appearing in BabelStone source expressions (notably SG in Unicode 19).
// KP is intentionally not atomic here: in the legacy notation it means the
// adjacent K (ROK) and P (DPRK) sources.
const sourceTokenPattern = /UCS2003|SAT|UTC|MY|SG|UK|[GHJKMPTBSUVXZ]/gu

const sourceExpressionCache = new Map<string, readonly string[]>()

export function parseBabelStoneIdsSourceExpression(sourceExpression: string): readonly string[] {
    const cached = sourceExpressionCache.get(sourceExpression)
    if (cached) return cached
    const tokens = sourceExpression.match(sourceTokenPattern) ?? []
    const unmatched = sourceExpression
        .replace(sourceTokenPattern, "")
        .replace(/[\[\]]/gu, "")
    if (tokens.length === 0 || unmatched.length > 0) {
        throw new Error(`unknown BabelStone IDS source expression: ${sourceExpression}`)
    }

    const result: string[] = []
    for (const token of tokens) {
        const source = canonicalSource.get(token)
        if (!source) throw new Error(`unknown BabelStone IDS source: ${token}`)
        if (!result.includes(source)) result.push(source)
    }
    const parsed = Object.freeze(result)
    sourceExpressionCache.set(sourceExpression, parsed)
    return parsed
}
