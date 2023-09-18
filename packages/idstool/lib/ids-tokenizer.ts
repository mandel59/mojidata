export function tokenizeIDS(ids: string) {
    // replace old IDS operators with new ones
    const replacedIds = ids.replace(/[↔↷⊖]/gu, c => {
        if (c === "↔") return "⿾"
        if (c === "↷") return "⿿"
        if (c === "⊖") return "㇯"
        throw new Error("unreachable")
    })
    const re = /\{\d+\}|&[^;]+;|@[TBLRMIO]|[\p{scx=Han}\u{20000}-\u{3FFFF}][\uFE00-\uFE0F\u{E0100}-\u{E01EF}]?|\S/giu
    const tokens: string[] = []
    let m
    while (m = re.exec(replacedIds)) {
        const token = m[0][0] === "@" ? m[0].toUpperCase() : m[0]
        tokens.push(token)
    }
    return tokens
}
