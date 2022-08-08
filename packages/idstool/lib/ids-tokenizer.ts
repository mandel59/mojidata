export function tokenizeIDS(ids: string) {
    const re = /\{\d+\}|&[^;]+;|@[TBLRMIO]|\S/giu
    const tokens: string[] = []
    let m
    while (m = re.exec(ids)) {
        const token = m[0][0] === "@" ? m[0].toUpperCase() : m[0]
        tokens.push(token)
    }
    return tokens
}
