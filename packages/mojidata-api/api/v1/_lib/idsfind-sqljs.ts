import type { Database, Statement } from "sql.js"

import {
  expandOverlaid,
  nodeLength,
  tokenizeIDS,
  type TokenList,
} from "@mandel59/idsdb"

import { openDatabaseFromFile } from "./sqljs"

const idsfindDbPath = require.resolve("@mandel59/idsdb/idsfind.db")

let idsfindDbPromise: Promise<Database> | undefined
async function getIdsfindDb(): Promise<Database> {
  idsfindDbPromise ??= openDatabaseFromFile(idsfindDbPath)
  return idsfindDbPromise
}

const idsfindQueryContext = `
with tokens as (
    select
        idslist.key as key0,
        ts0.key as key1,
        ts.key as key,
        ts.value as token
    from json_each($idslist) as idslist
    join json_each(idslist.value) as ts0
    join json_each(ts0.value) as ts
),
decomposed as (
    select
        tokens.key0,
        tokens.key1,
        tokens.key,
        ifnull(idsfind.IDS_tokens, tokens.token) as tokens
    from tokens left join idsfind on idsfind.UCS = tokens.token
),
combinations as (
    select
        decomposed.key0,
        decomposed.key1,
        tokens,
        0 as level
    from decomposed where decomposed.key = 0
    union all
    select
        decomposed.key0,
        decomposed.key1,
        combinations.tokens || ' ' || decomposed.tokens,
        decomposed.key
    from combinations join decomposed
    where
        decomposed.key0 = combinations.key0
        and
        decomposed.key1 = combinations.key1
        and
        decomposed.key = combinations.level + 1
),
patterns as (
    select
        combinations.key0,
        combinations.key1,
        group_concat('("' || replace(replace(replace(replace(tokens, ' ？ ', '" AND "'), '？ ', ''), '" AND "？', ''), ' ？', '') || '")', ' OR ') as pattern
    from combinations
    where level = (
        select max(decomposed.key)
        from decomposed
        where decomposed.key0 = combinations.key0
          and decomposed.key1 = combinations.key1
    )
    group by key0, key1
),
token_pattern as (
    select group_concat('(' || pattern || ')', ' AND ') as pattern
    from (
        select key0, group_concat('(' || pattern || ')', ' OR ') as pattern
        from patterns
        group by key0
    )
),
results as (
    select char AS UCS
    from idsfind_fts
    join token_pattern
    join idsfind_ref using (docid)
    where IDS_tokens match pattern
)
`

const idsfindQuery = `${idsfindQueryContext}\nselect UCS from results`

function tokenizeIdsList(idslist: string[]) {
  const idslistTokenized = idslist.map(tokenizeIDS).map(expandOverlaid)
  /** ids list without variable constraints. variables are replaced into placeholder token ？ */
  const idslistWithoutVC = idslistTokenized.map((x) =>
    x.map((y) => y.map((z) => (/^[a-zａ-ｚ]$/.test(z) ? "？" : z))),
  )
  return {
    forQuery: idslistWithoutVC,
    forAudit: idslistTokenized,
  }
}

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

let statementsPromise: Promise<IdsfindStatements> | undefined
async function getStatements(): Promise<IdsfindStatements> {
  if (!statementsPromise) {
    statementsPromise = getIdsfindDb().then((db) => {
      return {
        findStmt: db.prepare(idsfindQuery),
        getTokensStmt: db.prepare(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`),
      }
    })
  }
  return statementsPromise
}

export async function idsfind(idslist: string[]): Promise<string[]> {
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

