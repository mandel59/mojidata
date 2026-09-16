import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import test from "node:test"
import Database from "better-sqlite3"
import { createSqlApiDb } from "../../mojidata-api-core/lib/mojidata-api-db-sql"
import { getMojidataVariantEdgeQueries } from "../../mojidata-api-core/lib/mojidata-variant-queries"
import { createBetterSqlite3Executor } from "../lib/better-sqlite3-executor"
import type { SqlExecutor, SqlParams, SqlRow } from "@mandel59/mojidata-api-core"

// Freeze the pre-optimization SQL as an independent semantic reference.
const legacy: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/legacy-variant-queries.json"), "utf8"))
const canonical = (rows: unknown[]) => [...new Set(rows.map(row => JSON.stringify(row)))].sort()

test("indexed variant queries preserve every edge and recursive graph results", async () => {
  const db = new Database(require.resolve("@mandel59/mojidata/dist/moji.db"), { readonly: true })
  try {
    const endpoints = new Set<string>()
    for (const [index, query] of legacy.entries()) {
      const allEdges = query.replace(/WHERE c1 IN \(SELECT value FROM args\) OR c2 IN \(SELECT value FROM args\)\s*$/, "")
      db.prepare(`CREATE TEMP TABLE legacy_edges_${index} AS ${allEdges}`).run({ args: "[]" })
      db.exec(`CREATE INDEX legacy_edges_${index}_c1 ON legacy_edges_${index}(c1); CREATE INDEX legacy_edges_${index}_c2 ON legacy_edges_${index}(c2)`)
      for (const row of db.prepare(`SELECT c1, c2 FROM legacy_edges_${index}`).all() as { c1: string, c2: string }[]) {
        for (const value of [row.c1, row.c2]) if (typeof value === "string" && [...value].length === 1 && value.codePointAt(0)! > 255) endpoints.add(value)
      }
    }
    const selectLegacy = (index: number) => `SELECT c1, c2, r FROM legacy_edges_${index}
      WHERE c1 IN (SELECT value FROM json_each(@args)) OR c2 IN (SELECT value FROM json_each(@args))`
    // Every reverse Unihan edge must be discoverable through the candidate
    // index even when only its target (not its source) is requested.
    assert.deepEqual(db.prepare(`SELECT c1, c2, r FROM legacy_edges_0
      WHERE r GLOB 'k*' AND length(c2) = 1 AND unicode(c2) > 255 AND c1 <> c2
        AND NOT EXISTS (SELECT 1 FROM unihan_value_ref WHERE UCS = c1 AND ref = c2)`).all(), [])
    // Cover both directions for all real non-Latin-1 endpoints, including every
    // relation label, rather than just the example that exhausted the quota.
    const all = [...endpoints]
    const args = JSON.stringify(all)
    for (const [index, query] of getMojidataVariantEdgeQueries(all).entries()) {
      assert.deepEqual(canonical(db.prepare(query).all({ args })), canonical(db.prepare(selectLegacy(index)).all({ args })))
    }

    const executor = createBetterSqlite3Executor(db)
    let queryIndex = 0
    const reference: SqlExecutor = {
      ...executor,
      async query<T extends SqlRow>(_: string, params?: SqlParams): Promise<T[]> {
        assert.ok(params && !Array.isArray(params))
        return db.prepare(selectLegacy(queryIndex++ % 3)).all({ args: params["@args"] }) as T[]
      },
    }
    const api = createSqlApiDb({ getMojidataDb: async () => executor, getIdsfindDb: async () => executor })
    const baseline = createSqlApiDb({ getMojidataDb: async () => reference, getIdsfindDb: async () => reference })
    for (const chars of [[], ["漢", "漢"], ["漢", "漢"], ["一"], ["辺"], ["邊"], ["高", "髙"], ["崎", "﨑"], ["龍", "竜"], ["国"], ["弁"], ["A"], ["一󠄀"], ["\u{3ffff}"]]) {
      queryIndex = 0
      assert.deepEqual(canonical(await api.getMojidataVariantRels(chars)), canonical(await baseline.getMojidataVariantRels(chars)), JSON.stringify(chars))
    }
  } finally { db.close() }
})

test("ordinary character lookups do not scan source relation tables", () => {
  const db = new Database(require.resolve("@mandel59/mojidata/dist/moji.db"), { readonly: true })
  try {
    for (const query of getMojidataVariantEdgeQueries(["漢", "漢"])) {
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all({ args: '["漢","漢"]' }) as { detail: string }[]
      assert.deepEqual(plan.filter(row => /^SCAN (?:unihan_(?!sources\b)|mjsm_|mji\b|nyukan_|doon\b|joyo_|kdpv_|tghb_)/.test(row.detail)), [])
    }
  } finally { db.close() }
})

test("variant SQL executes with the D1 compound SELECT limit", () => {
  execFileSync("python3", ["-c", `
import json, sqlite3, sys
payload = json.load(sys.stdin)
db = sqlite3.connect('file:' + payload['database'] + '?mode=ro', uri=True)
# Load the existing schema before restricting runtime query compilation.
db.execute('SELECT * FROM sqlite_schema').fetchall()
db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT, 5)
for query in payload['queries']:
    db.execute(query, {'args': '["漢","漢"]'}).fetchall()
db.close()
`], {
    input: JSON.stringify({ database: require.resolve("@mandel59/mojidata/dist/moji.db"), queries: getMojidataVariantEdgeQueries(["漢", "漢"]) }),
    stdio: ["pipe", "pipe", "pipe"],
  })
})
