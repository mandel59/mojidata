import assert from "node:assert/strict"
import { describe, test } from "node:test"

import Database from "better-sqlite3"

import { createIdsfind } from "@mandel59/mojidata-api-core/lib/idsfind-sql"

import { createBetterSqlite3Executor } from "../index"

function createCompositeLiteralFixture(queryPlan?: object) {
  const db = new Database(":memory:")
  db.exec(`
    CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
    CREATE VIRTUAL TABLE idsfind_fts USING fts5 (
      IDS_tokens,
      content='',
      tokenize="unicode61 tokenchars '§⿰'"
    );
    INSERT INTO idsfind VALUES
      ('X', '⿰ 日 月'),
      ('明', '⿰ 日 月');
    INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES
      (1, '§ ⿰ 日 月 §'),
      (2, '§ ⿰ 日 月 §');
  `)
  if (queryPlan !== undefined) {
    db.exec(`
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        query_plan_json TEXT NOT NULL
      );
    `)
    db.prepare(
      "INSERT INTO idsfind_semantics VALUES (1, ?)",
    ).run(JSON.stringify(queryPlan))
  }
  const executor = createBetterSqlite3Executor(db)
  return {
    db,
    idsfind: createIdsfind(async () => executor),
  }
}

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

  test("rejects a root wildcard against an incomplete IDS row", async () => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      INSERT INTO idsfind (UCS, IDS_tokens) VALUES ('X', '⿰ 火');
    `)

    const executor = createBetterSqlite3Executor(db)
    const idsfind = createIdsfind(async () => executor, {
      async getCandidates() {
        return ["X"]
      },
    })

    assert.deepEqual(await idsfind(["§？§"]), [])
    db.close()
  })

  test("binds materialized literal resolution to the database plan", async () => {
    const raw = createCompositeLiteralFixture({
      version: 1,
      transforms: [],
    })
    try {
      assert.deepEqual(await raw.idsfind(["§明§"]), [])
    } finally {
      raw.db.close()
    }

    const decomposed = createCompositeLiteralFixture({
      version: 1,
      transforms: [
        { op: "expand-overlaid", version: 1 },
        { op: "resolve-materialized-components", version: 1 },
      ],
    })
    try {
      assert.deepEqual(
        (await decomposed.idsfind(["§明§"])).toSorted(),
        ["X", "明"],
      )
    } finally {
      decomposed.db.close()
    }

    const legacy = createCompositeLiteralFixture()
    try {
      assert.deepEqual(
        (await legacy.idsfind(["§明§"])).toSorted(),
        ["X", "明"],
      )
    } finally {
      legacy.db.close()
    }
  })

  test("uses the database query plan for raw overlaid IDS", async () => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        query_plan_json TEXT NOT NULL
      );
      INSERT INTO idsfind VALUES ('甲', '⿻ 日 丨');
      INSERT INTO idsfind_semantics VALUES (
        1,
        '{"version":1,"transforms":[]}'
      );
    `)

    const executor = createBetterSqlite3Executor(db)
    const idsfind = createIdsfind(async () => executor, {
      async getCandidates(_db, idslist, _sourceIdslist, policy) {
        assert.deepEqual(idslist, [[["⿻", "日", "丨"]]])
        assert.equal(policy?.resolveMaterializedComponents, false)
        return ["甲"]
      },
    })

    assert.deepEqual(await idsfind(["⿻日丨"]), ["甲"])
    db.close()
  })

  test("uses the database query plan for decomposed overlaid IDS", async () => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        query_plan_json TEXT NOT NULL
      );
      INSERT INTO idsfind_semantics VALUES (
        1,
        '{
          "version":1,
          "transforms":[
            {"op":"expand-overlaid","version":1},
            {"op":"resolve-materialized-components","version":1}
          ]
        }'
      );
    `)

    const executor = createBetterSqlite3Executor(db)
    const idsfind = createIdsfind(async () => executor, {
      async getCandidates(_db, idslist, _sourceIdslist, policy) {
        assert.deepEqual(idslist, [[
          ["&OL3;", "？", "日", "丨"],
          ["&OL3;", "？", "丨", "日"],
        ]])
        assert.equal(policy?.resolveMaterializedComponents, true)
        return []
      },
    })
    assert.deepEqual(await idsfind(["⿻日丨"]), [])
    db.close()
  })

  test("rejects an unknown database query transform", async () => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE TABLE idsfind_semantics (
        schema_version INTEGER PRIMARY KEY,
        query_plan_json TEXT NOT NULL
      );
      INSERT INTO idsfind_semantics VALUES (
        1,
        '{"version":1,"transforms":[{"op":"future-op","version":1}]}'
      );
    `)

    const executor = createBetterSqlite3Executor(db)
    const idsfind = createIdsfind(async () => executor)
    await assert.rejects(
      idsfind(["日"]),
      /not a supported query transform/,
    )
    db.close()
  })
})
