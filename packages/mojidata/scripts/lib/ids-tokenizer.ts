export function tokenizeIDS(ids: string) {
    const re = /\{\d{2}\}|&[^;]+;|\S/gu
    const tokens: string[] = []
    let m
    while (m = re.exec(ids)) {
        const token = m[0]
        tokens.push(token)
    }
    return tokens
}
