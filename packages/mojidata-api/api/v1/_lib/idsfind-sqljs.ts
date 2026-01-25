import type { Database, Statement } from "sql.js"

import {
  nodeLength,
  type TokenList,
} from "@mandel59/idsdb-utils"

import { idsfindQuery } from "./idsfind-query"
import { tokenizeIdsList } from "./idsfind-tokenize"

function idsmatch(
  tokens: string[],
  pattern: TokenList,
  getIDSTokens: (ucs: string) => string[],
) {
  const matchFrom = (i: number) => {
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
      const ts = getIDSTokens(pattern[j])
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
    if (matchFrom(i)) {
      count++
    }
  }
  return count
}

function postaudit(
  result: string,
  idslist: TokenList[][],
  getIDSTokensForUcs: (ucs: string) => string[],
) {
  for (const IDS_tokens of getIDSTokensForUcs(result)) {
    const tokens = IDS_tokens.split(" ")
    if (
      idslist.every((patterns) => {
        return patterns.some(
          (pattern) => idsmatch(tokens, pattern, getIDSTokensForUcs) >= pattern.multiplicity,
        )
      })
    ) {
      return true
    }
  }
  return false
}

type IdsfindStatements = {
  findStmt: Statement
  getTokensStmt: Statement
}

export function createIdsfind(getDb: () => Promise<Database>) {
  let statementsPromise: Promise<IdsfindStatements> | undefined
  async function getStatements(): Promise<IdsfindStatements> {
    statementsPromise ??= getDb().then((db) => {
      return {
        findStmt: db.prepare(idsfindQuery),
        getTokensStmt: db.prepare(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`),
      }
    })
    return statementsPromise
  }

  return async (idslist: string[]): Promise<string[]> => {
    const { findStmt, getTokensStmt } = await getStatements()
    const tokenized = tokenizeIdsList(idslist)

    const getIDSTokensForUcs = (ucs: string) => {
      const out: string[] = []
      getTokensStmt.bind({ $ucs: ucs })
      while (getTokensStmt.step()) {
        const row = getTokensStmt.getAsObject() as { IDS_tokens?: string }
        if (typeof row.IDS_tokens === "string") out.push(row.IDS_tokens)
      }
      getTokensStmt.reset()
      return out
    }

    const out: string[] = []
    findStmt.bind({ $idslist: JSON.stringify(tokenized.forQuery) })
    while (findStmt.step()) {
      const row = findStmt.getAsObject() as { UCS?: string }
      const ucs = row.UCS
      if (typeof ucs !== "string") continue
      if (postaudit(ucs, tokenized.forAudit, getIDSTokensForUcs)) {
        out.push(ucs)
      }
    }
    findStmt.reset()
    return out
  }
}
