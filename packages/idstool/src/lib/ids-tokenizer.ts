export function tokenizeIDS(ids: string) {
    const re = /-\([^\)]+\)|-.|\{\d{2}\}|&[^;]+;|\S/gu
    const tokens: string[] = []
    let m
    while (m = re.exec(ids)) {
        const token = m[0]
        if (token[0] === "-") {
            const prev = tokens.pop()
            if (prev === undefined) throw new Error("invalid IDS")
            tokens.push("〾")
            tokens.push(prev)
        } else {
            tokens.push(token)
        }
    }
    return tokens
}
