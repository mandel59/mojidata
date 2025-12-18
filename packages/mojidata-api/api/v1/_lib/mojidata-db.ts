import Database from 'better-sqlite3'

const mojidb = require.resolve('@mandel59/mojidata/dist/moji.db')

const db = new Database(mojidb)

db.table('regexp_all', {
  parameters: ['_string', '_pattern'],
  columns: ['substr', 'groups'],
  rows: function* (string: any, pattern: any) {
    const re = new RegExp(pattern, 'gu')
    let m
    while ((m = re.exec(string))) {
      const substr = m[0]
      if (m.groups) {
        yield [substr, JSON.stringify(m.groups)]
      } else {
        yield [substr, JSON.stringify(m.slice(1))]
      }
    }
  },
})

db.function('parse_int', (s: string, base: number) => {
  const i = parseInt(s, base)
  if (!Number.isSafeInteger(i)) {
    return null
  }
  return BigInt(i)
})

db.function('regexp', (pattern: string, s: string) => {
  return new RegExp(pattern, 'v').test(s) ? 1n : 0n
})

export { db }
