export type TokenList = string[] & TokenMetadata

export type TokenMetadata = {
    multiplicity: number
}

export function getTokenMetadata(tokens: TokenList): TokenMetadata {
    const { multiplicity } = tokens
    return { multiplicity }
}

export function withTokenMetadata(tokens: string[], metadata: TokenMetadata): TokenList {
    const { multiplicity } = metadata
    return Object.assign(tokens, { multiplicity })
}
