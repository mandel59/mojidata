import { expandOverlaid, nodeLength, tokenizeIDS } from "@mandel59/idsdb"
import type { TokenList } from "@mandel59/idsdb"

export function tokenizeIdsList(idslist: string[]) {
    const idslistTokenized = idslist.map(tokenizeIDS).map(expandOverlaid)
    /** ids list without variable constraints. variables are replaced into placeholder token ？ */
    const idslistWithoutVC = idslistTokenized.map(x => x.map(y => y.map(z => /^[a-zａ-ｚ]$/.test(z) ? "？" : z)))
    return {
        forQuery: idslistWithoutVC,
        forAudit: idslistTokenized,
    }
}

export function idsmatch(
    tokens: string[],
    pattern: TokenList,
    getIDSTokens: (ucs: string) => string[],
) {
    const matchFrom = (i: number) => {
        const vars = new Map<string, string[]>()
        let k = i
        loop: for (let j = 0; j < pattern.length; j++) {
            if (pattern[j] === '§') {
                if (k === 0 || k === tokens.length) {
                    continue loop
                }
            } else if (pattern[j] === '？') {
                k += nodeLength(tokens, k)
                continue loop
            } else if (/^[a-zａ-ｚ]$/.test(pattern[j])) {
                const varname = pattern[j]
                const l = nodeLength(tokens, k)
                const slice = vars.get(varname)
                if (slice) {
                    if (!slice.every((t, offset) => t === tokens[k + offset])) {
                        return false
                    }
                } else {
                    vars.set(varname, tokens.slice(k, k + l))
                }
                k += l
                continue loop
            }
            const ts = getIDSTokens(pattern[j])
            if (ts.length === 0 && pattern[j] === tokens[k]) {
                k++
                continue loop
            }
            for (const t of ts) {
                const l = t.split(' ').length
                if (tokens.slice(k, k + l).join(' ') === t) {
                    k += l
                    continue loop
                }
            }
            return false
        }
        if (k > tokens.length) {
            return false
        }
        return true
    }
    let count = 0
    for (let i = 0; i < tokens.length; i++) {
        if (matchFrom(i)) {
            count++
        }
    }
    return count
}

export function postaudit(
    result: string,
    idslist: TokenList[][],
    getIDSTokensForUcs: (ucs: string) => string[],
) {
    for (const IDS_tokens of getIDSTokensForUcs(result)) {
        const tokens = IDS_tokens.split(' ')
        if (idslist.every(patterns => {
            return patterns.some(pattern =>
                idsmatch(tokens, pattern, getIDSTokensForUcs) >= (pattern.multiplicity ?? 1))
        })) {
            return true
        }
    }
    return false
}
