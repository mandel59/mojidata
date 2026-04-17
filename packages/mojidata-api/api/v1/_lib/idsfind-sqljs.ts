import {
  nodeLength,
  type TokenList,
} from "@mandel59/idsdb-utils"

import { idsfindQuery } from "./idsfind-query"
import { tokenizeIdsList } from "./idsfind-tokenize"
import type { SqlExecutor } from "./sql-executor"

async function idsmatch(
  tokens: string[],
  pattern: TokenList,
  getIDSTokens: (ucs: string) => Promise<string[]>,
) {
  const matchFrom = async (i: number) => {
    const vars = new Map<string, string[]>()
    let k = i
    loop: for (let j = 0; j < pattern.length; j++) {
      if (pattern[j] === "§") {
        if (k === 0 || k === tokens.length) {
          continue loop
        }
      } else if (pattern[j] === "？") {
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
      const ts = await getIDSTokens(pattern[j])
      if (ts.length === 0 && pattern[j] === tokens[k]) {
        k++
        continue loop
      }
      for (const t of ts) {
        const l = t.split(" ").length
        if (tokens.slice(k, k + l).join(" ") === t) {
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
    if (await matchFrom(i)) {
      count++
    }
  }
  return count
}

async function postaudit(
  result: string,
  idslist: TokenList[][],
  getIDSTokensForUcs: (ucs: string) => Promise<string[]>,
) {
  for (const IDS_tokens of await getIDSTokensForUcs(result)) {
    const tokens = IDS_tokens.split(" ")
    if (
      await (async () => {
        for (const patterns of idslist) {
          let matched = false
          for (const pattern of patterns) {
            if ((await idsmatch(tokens, pattern, getIDSTokensForUcs)) >= pattern.multiplicity) {
              matched = true
              break
            }
          }
          if (!matched) {
            return false
          }
        }
        return true
      })()
    ) {
      return true
    }
  }
  return false
}

export function createIdsfind(getDb: () => Promise<SqlExecutor>) {
  return async (idslist: string[]): Promise<string[]> => {
    const db = await getDb()
    const tokenized = tokenizeIdsList(idslist)
    const idsTokensCache = new Map<string, Promise<string[]>>()

    const getIDSTokensForUcs = async (ucs: string) => {
      let rowsPromise = idsTokensCache.get(ucs)
      if (!rowsPromise) {
        rowsPromise = db
          .query<{ IDS_tokens?: string }>(
            `SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`,
            { $ucs: ucs },
          )
          .then((rows) =>
            rows.flatMap((row) =>
              typeof row.IDS_tokens === "string" ? [row.IDS_tokens] : [],
            ),
          )
        idsTokensCache.set(ucs, rowsPromise)
      }
      return await rowsPromise
    }

    const out: string[] = []
    const rows = await db.query<{ UCS?: string }>(idsfindQuery, {
      $idslist: JSON.stringify(tokenized.forQuery),
    })
    for (const row of rows) {
      const ucs = row.UCS
      if (typeof ucs !== "string") continue
      if (await postaudit(ucs, tokenized.forAudit, getIDSTokensForUcs)) {
        out.push(ucs)
      }
    }
    return out
  }
}
