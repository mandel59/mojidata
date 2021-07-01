export function tokenizeIDS(ids: string) {
    const re = /\{\d{2}\}|&[^;]+;|@[TBLRMIO]|\S/giu
    const tokens: string[] = []
    let m
    while (m = re.exec(ids)) {
        const token = m[0]
        tokens.push(token.toUpperCase())
    }
    return tokens
}
