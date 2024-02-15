import { withTokenMetadata } from "./token-list"

export function tokenizeIDS(ids: string) {
    // replace old IDS operators with new ones
    const replacedIds = ids.replace(/[↔↷⊖]/gu, c => {
        if (c === "↔") return "⿾"
        if (c === "↷") return "⿿"
        if (c === "⊖") return "㇯"
        throw new Error("unreachable")
    })
    // split multiplicity part
    const [idsPart, multiplicityPart = "1"] = replacedIds.split(/[\*＊×]/)
    let multiplicity = parseInt(multiplicityPart.normalize("NFKC"), 10)
    if (!Number.isSafeInteger(multiplicity)) {
        // ignore invalid multiplicity
        multiplicity = 1
    }
    const re = /\{\d+\}|&[^;]+;|@[TBLRMIO]|[\p{scx=Han}\u{20000}-\u{3FFFF}][\uFE00-\uFE0F\u{E0100}-\u{E01EF}]?|\S/giu
    const tokens = []
    let m
    while (m = re.exec(idsPart)) {
        const token = m[0][0] === "@" ? m[0].toUpperCase() : m[0]
        tokens.push(token)
    }
    return withTokenMetadata(tokens, { multiplicity })
}
