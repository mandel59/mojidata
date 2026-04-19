import type { SqlExecutor, SqlParams, SqlRow } from "@mandel59/mojidata-api-core"

export type D1ResultLike<T extends SqlRow = SqlRow> = {
  results?: T[] | null
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  run<T extends SqlRow = SqlRow>(): Promise<D1ResultLike<T>>
  first<T = SqlRow>(columnName?: string): Promise<T | null>
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike
}

function isIdentifierStart(char: string | undefined) {
  return Boolean(char && /[A-Za-z_]/u.test(char))
}

function isIdentifierPart(char: string | undefined) {
  return Boolean(char && /[A-Za-z0-9_]/u.test(char))
}

function resolveParamValue(params: Record<string, unknown>, token: string) {
  if (Object.prototype.hasOwnProperty.call(params, token)) {
    return params[token]
  }
  const bareName = token.slice(1)
  if (Object.prototype.hasOwnProperty.call(params, bareName)) {
    return params[bareName]
  }
  throw new Error(`Missing SQL parameter for D1 executor: ${token}`)
}

function appendQuoted(sql: string, start: number, quote: string) {
  let cursor = start + 1
  while (cursor < sql.length) {
    if (sql[cursor] === quote) {
      if (sql[cursor + 1] === quote) {
        cursor += 2
        continue
      }
      return cursor + 1
    }
    cursor += 1
  }
  return sql.length
}

function appendBracketQuoted(sql: string, start: number) {
  let cursor = start + 1
  while (cursor < sql.length) {
    if (sql[cursor] === "]") {
      return cursor + 1
    }
    cursor += 1
  }
  return sql.length
}

function appendLineComment(sql: string, start: number) {
  let cursor = start + 2
  while (cursor < sql.length) {
    if (sql[cursor] === "\n") {
      return cursor
    }
    cursor += 1
  }
  return sql.length
}

function appendBlockComment(sql: string, start: number) {
  let cursor = start + 2
  while (cursor < sql.length) {
    if (sql[cursor] === "*" && sql[cursor + 1] === "/") {
      return cursor + 2
    }
    cursor += 1
  }
  return sql.length
}

export function rewriteNamedParamsForD1(
  sql: string,
  params: Record<string, unknown>,
): { sql: string; values: unknown[] } {
  const out: string[] = []
  const values: unknown[] = []
  const indexByToken = new Map<string, number>()

  let cursor = 0
  while (cursor < sql.length) {
    const char = sql[cursor]

    if (char === "'" || char === '"' || char === "`") {
      const next = appendQuoted(sql, cursor, char)
      out.push(sql.slice(cursor, next))
      cursor = next
      continue
    }

    if (char === "[") {
      const next = appendBracketQuoted(sql, cursor)
      out.push(sql.slice(cursor, next))
      cursor = next
      continue
    }

    if (char === "-" && sql[cursor + 1] === "-") {
      const next = appendLineComment(sql, cursor)
      out.push(sql.slice(cursor, next))
      cursor = next
      continue
    }

    if (char === "/" && sql[cursor + 1] === "*") {
      const next = appendBlockComment(sql, cursor)
      out.push(sql.slice(cursor, next))
      cursor = next
      continue
    }

    if ((char === "@" || char === "$" || char === ":") && isIdentifierStart(sql[cursor + 1])) {
      let next = cursor + 2
      while (isIdentifierPart(sql[next])) {
        next += 1
      }
      const token = sql.slice(cursor, next)
      let index = indexByToken.get(token)
      if (index === undefined) {
        values.push(resolveParamValue(params, token))
        index = values.length
        indexByToken.set(token, index)
      }
      out.push(`?${index}`)
      cursor = next
      continue
    }

    out.push(char)
    cursor += 1
  }

  return { sql: out.join(""), values }
}

function prepareD1Statement(
  db: D1DatabaseLike,
  sql: string,
  params?: SqlParams,
): D1PreparedStatementLike {
  if (params === undefined) {
    return db.prepare(sql)
  }

  if (Array.isArray(params)) {
    return db.prepare(sql).bind(...params)
  }

  const rewritten = rewriteNamedParamsForD1(sql, params)
  return db.prepare(rewritten.sql).bind(...rewritten.values)
}

export function createD1Executor(db: D1DatabaseLike): SqlExecutor {
  return {
    async query<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T[]> {
      const result = await prepareD1Statement(db, sql, params).run<T>()
      return result.results ?? []
    },
    async queryOne<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T | null> {
      return await prepareD1Statement(db, sql, params).first<T>()
    },
  }
}
