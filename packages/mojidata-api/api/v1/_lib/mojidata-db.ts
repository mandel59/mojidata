import type { Database } from "sql.js"
import { openDatabaseFromFile } from "./sqljs"

const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

let dbPromise: Promise<Database> | undefined

function regexpAllJson(input: unknown, pattern: unknown) {
  const string = String(input ?? "")
  const re = new RegExp(String(pattern), "gu")
  const out: Array<{ substr: string; groups: Record<string, string> | unknown[] }> =
    []
  let match: RegExpExecArray | null
  while ((match = re.exec(string))) {
    out.push({
      substr: match[0],
      groups: match.groups ?? match.slice(1),
    })
  }
  return JSON.stringify(out)
}

async function initDb(db: Database) {
  // scalar function returning JSON array of matches (see query-expressions.ts)
  db.create_function("regexp_all", regexpAllJson)

  db.create_function("parse_int", (s: string, base: number) => {
  const i = parseInt(s, base)
  if (!Number.isSafeInteger(i)) {
    return null
  }
  return i
  })

  // SQLite REGEXP operator uses `regexp(pattern, value)`
  db.create_function("regexp", (pattern: string, s: string) => {
    return new RegExp(pattern, "u").test(s) ? 1 : 0
  })
}

export function getMojidataDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = openDatabaseFromFile(mojidb).then(async (db) => {
      await initDb(db)
      return db
    })
  }
  return dbPromise
}
