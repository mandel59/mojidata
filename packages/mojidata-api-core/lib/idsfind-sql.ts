import {
  tokenArgs,
  type TokenList,
} from "@mandel59/idsdb-utils"

import { idsfindQuery } from "./idsfind-query"
import { tokenizeIdsList } from "./idsfind-tokenize"
import type { SqlExecutor } from "./sql-executor"

const idsTokensPrefetchQuery = `
  SELECT UCS, IDS_tokens
  FROM idsfind
  WHERE UCS IN (SELECT value FROM json_each($ucslist))
`

const idsTokensPrefetchBatchSize = 256

function isPatternVariableToken(token: string) {
  return /^[a-zａ-ｚ]$/u.test(token)
}

function chunkArray<T>(values: T[], size: number) {
  const out: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size))
  }
  return out
}

function collectAuditLookupUcs(idslist: TokenList[][]) {
  const tokens = new Set<string>()
  for (const patterns of idslist) {
    for (const pattern of patterns) {
      for (const token of pattern) {
        if (token === "§" || token === "？" || isPatternVariableToken(token)) {
          continue
        }
        tokens.add(token)
      }
    }
  }
  return [...tokens]
}

type CompiledPatternToken =
  | { kind: "anchor" }
  | { kind: "wildcard" }
  | { kind: "variable"; name: string }
  | { kind: "literal"; value: string; alternatives: string[][] }

type CompiledPattern = {
  tokens: CompiledPatternToken[]
  multiplicity: number
  anchoredAtRoot: boolean
}

function compileAuditPatterns(
  idslist: TokenList[][],
  getIDSTokens: (ucs: string) => string[],
): CompiledPattern[][] {
  return idslist.map((patterns) =>
    patterns.map((pattern) => ({
      multiplicity: pattern.multiplicity,
      anchoredAtRoot: pattern[0] === "§",
      tokens: pattern.map((token): CompiledPatternToken => {
        if (token === "§") return { kind: "anchor" }
        if (token === "？") return { kind: "wildcard" }
        if (isPatternVariableToken(token)) {
          return { kind: "variable", name: token }
        }
        return {
          kind: "literal",
          value: token,
          alternatives: getIDSTokens(token).map((ids) => ids.split(" ")),
        }
      }),
    })),
  )
}

function idsmatch(tokens: string[], pattern: CompiledPattern) {
  const nodeLengths = new Map<number, number | undefined>()
  const getNodeLength = (start: number) => {
    if (nodeLengths.has(start)) return nodeLengths.get(start)
    if (start < 0 || start >= tokens.length) {
      nodeLengths.set(start, undefined)
      return undefined
    }
    let offset = start
    let remaining = 1
    while (remaining > 0) {
      if (offset >= tokens.length) {
        nodeLengths.set(start, undefined)
        return undefined
      }
      const token = tokens[offset++]
      remaining += (tokenArgs[token] ?? 0) - 1
    }
    const length = offset - start
    nodeLengths.set(start, length)
    return length
  }
  const alternativeMatches = (start: number, alternative: string[]) =>
    alternative.every((token, offset) => tokens[start + offset] === token)

  const matchFrom = (i: number) => {
    const vars = new Map<string, string[]>()
    let k = i
    loop: for (const token of pattern.tokens) {
      if (token.kind === "anchor") {
        if (k === 0 || k === tokens.length) {
          continue loop
        }
        return false
      } else if (token.kind === "wildcard") {
        const length = getNodeLength(k)
        if (length === undefined) return false
        k += length
        continue loop
      } else if (token.kind === "variable") {
        const length = getNodeLength(k)
        if (length === undefined) return false
        const slice = vars.get(token.name)
        if (slice) {
          if (!slice.every((t, offset) => t === tokens[k + offset])) {
            return false
          }
        } else {
          vars.set(token.name, tokens.slice(k, k + length))
        }
        k += length
        continue loop
      }
      if (token.alternatives.length === 0 && token.value === tokens[k]) {
        k++
        continue loop
      }
      for (const alternative of token.alternatives) {
        if (alternativeMatches(k, alternative)) {
          k += alternative.length
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
  const end = pattern.anchoredAtRoot ? Math.min(1, tokens.length) : tokens.length
  for (let i = 0; i < end; i++) {
    if (matchFrom(i)) {
      count++
    }
  }
  return count
}

function postaudit(
  result: string,
  idslist: CompiledPattern[][],
  getIDSTokensForUcs: (ucs: string) => string[],
) {
  for (const IDS_tokens of getIDSTokensForUcs(result)) {
    const tokens = IDS_tokens.split(" ")
    let allGroupsMatched = true
    for (const patterns of idslist) {
      let matched = false
      for (const pattern of patterns) {
        if (idsmatch(tokens, pattern) >= pattern.multiplicity) {
          matched = true
          break
        }
      }
      if (!matched) {
        allGroupsMatched = false
        break
      }
    }
    if (allGroupsMatched) return true
  }
  return false
}

export function createIdsfind(getDb: () => Promise<SqlExecutor>) {
  return async (idslist: string[]): Promise<string[]> => {
    const db = await getDb()
    const tokenized = tokenizeIdsList(idslist)
    const idsTokensCache = new Map<string, string[]>()

    const prefetchIDSTokens = async (ucsValues: Iterable<string>) => {
      const pending = [...new Set(ucsValues)].filter((ucs) => !idsTokensCache.has(ucs))
      for (const chunk of chunkArray(pending, idsTokensPrefetchBatchSize)) {
        if (chunk.length === 0) {
          continue
        }
        const prefetched = new Map<string, string[]>(chunk.map((ucs) => [ucs, []]))
        const rows = await db.query<{ UCS?: string; IDS_tokens?: string }>(
          idsTokensPrefetchQuery,
          { $ucslist: JSON.stringify(chunk) },
        )
        for (const row of rows) {
          if (typeof row.UCS !== "string" || typeof row.IDS_tokens !== "string") {
            continue
          }
          const list = prefetched.get(row.UCS)
          if (!list) {
            continue
          }
          list.push(row.IDS_tokens)
        }
        for (const [ucs, tokens] of prefetched) {
          idsTokensCache.set(ucs, tokens)
        }
      }
    }

    const getIDSTokensForUcs = (ucs: string) => {
      const tokens = idsTokensCache.get(ucs)
      if (!tokens) {
        throw new Error(`IDS tokens were not prefetched for ${ucs}`)
      }
      return tokens
    }

    const out: string[] = []
    const rows = await db.query<{ UCS?: string }>(idsfindQuery, {
      $idslist: JSON.stringify(tokenized.forQuery),
    })
    await prefetchIDSTokens([
      ...rows.flatMap((row) => (typeof row.UCS === "string" ? [row.UCS] : [])),
      ...collectAuditLookupUcs(tokenized.forAudit),
    ])
    const compiledAudit = compileAuditPatterns(
      tokenized.forAudit,
      getIDSTokensForUcs,
    )
    for (const row of rows) {
      const ucs = row.UCS
      if (typeof ucs !== "string") continue
      if (postaudit(ucs, compiledAudit, getIDSTokensForUcs)) {
        out.push(ucs)
      }
    }
    return out
  }
}
