import assert from "node:assert/strict"
import { describe, test } from "node:test"

import Database from "better-sqlite3"

import { createIdsfind } from "@mandel59/mojidata-api-core/lib/idsfind-sql"

import { createBetterSqlite3Executor } from "../index"

describe("idsfind query compatibility", () => {
  test("supports the rowid-based idsfind query against FTS5", async () => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE VIRTUAL TABLE idsfind_fts USING fts5 (
        IDS_tokens,
        content='',
        tokenize="unicode61 tokenchars '§⿰'"
      );

      INSERT INTO idsfind (UCS, IDS_tokens) VALUES ('灶', '⿰ 火 土');
      INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (1, '§ ⿰ 火 土 §');
    `)

    const executor = createBetterSqlite3Executor(db)
    const idsfind = createIdsfind(async () => executor)
    const results = await idsfind(["⿰火土"])

    assert.deepEqual(results, ["灶"])
    db.close()
  })
})
