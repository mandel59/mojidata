import assert from "node:assert/strict"
import { describe, test } from "node:test"

import Database from "better-sqlite3"

import { createIdsfind } from "@mandel59/mojidata-api-core/lib/idsfind-sql"

import { createBetterSqlite3Executor } from "../index"

type FtsModule = "fts4" | "fts5"

function createCompositeLiteralFixture(
  queryPlan?: object,
  ftsModule: FtsModule = "fts5",
) {
  const db = new Database(":memory:")
  const ftsDefinition = ftsModule === "fts4"
    ? `fts4 (IDS_tokens, content='', tokenize=unicode61 "tokenchars=§⿰")`
    : `fts5 (IDS_tokens, content='', tokenize="unicode61 tokenchars '§⿰'")`
  db.exec(`
    CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
    CREATE VIRTUAL TABLE idsfind_fts USING ${ftsDefinition};
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

function createProfileFixture(
  semanticsProfile: string,
  recipeSha256: string | null,
  ftsModule: FtsModule,
) {
  const fixture = createCompositeLiteralFixture(undefined, ftsModule)
  fixture.db.exec(`
    CREATE TABLE idsfind_semantics (
      schema_version INTEGER PRIMARY KEY,
      semantics_profile TEXT NOT NULL,
      recipe_sha256 TEXT
    );
  `)
  fixture.db.prepare(
    "INSERT INTO idsfind_semantics VALUES (2, ?, ?)",
  ).run(semanticsProfile, recipeSha256)
  return fixture
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

  for (const ftsModule of ["fts4", "fts5"] as const) {
    test(`binds materialized literal resolution to the database plan with ${ftsModule}`, async () => {
      const raw = createCompositeLiteralFixture({
        version: 1,
        transforms: [],
      }, ftsModule)
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
      }, ftsModule)
      try {
        assert.deepEqual(
          (await decomposed.idsfind(["§明§"])).toSorted(),
          ["X", "明"],
        )
      } finally {
        decomposed.db.close()
      }

      const legacy = createCompositeLiteralFixture(undefined, ftsModule)
      try {
        assert.deepEqual(
          (await legacy.idsfind(["§明§"])).toSorted(),
          ["X", "明"],
        )
      } finally {
        legacy.db.close()
      }
    })

    test(`uses registered schema 2 semantics profiles with ${ftsModule}`, async () => {
      const raw = createProfileFixture(
        "idsflow-records@1",
        "0".repeat(64),
        ftsModule,
      )
      try {
        assert.deepEqual(await raw.idsfind(["§明§"]), [])
      } finally {
        raw.db.close()
      }

      const decomposed = createProfileFixture(
        "idsflow-decompose@1",
        "1".repeat(64),
        ftsModule,
      )
      try {
        assert.deepEqual(
          (await decomposed.idsfind(["§明§"])).toSorted(),
          ["X", "明"],
        )
      } finally {
        decomposed.db.close()
      }
    })
  }

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

  test("rejects unknown schema 2 semantics profiles and invalid recipe identities", async () => {
    for (const manifestCase of [
      {
        profile: "future-profile@1",
        recipeSha256: "0".repeat(64),
        error: /unsupported IDS query semantics profile/,
      },
      {
        profile: "idsflow-records@1",
        recipeSha256: "not-a-sha256",
        error: /invalid recipe identity/,
      },
    ]) {
      const fixture = createProfileFixture(
        manifestCase.profile,
        manifestCase.recipeSha256,
        "fts5",
      )
      try {
        await assert.rejects(
          fixture.idsfind(["日"]),
          manifestCase.error,
        )
      } finally {
        fixture.db.close()
      }
    }

    const missingIdentity = new Database(":memory:")
    try {
      missingIdentity.exec(`
        CREATE TABLE idsfind_semantics (
          schema_version INTEGER PRIMARY KEY,
          semantics_profile TEXT NOT NULL
        );
        INSERT INTO idsfind_semantics VALUES (2, 'idsflow-records@1');
      `)
      const idsfind = createIdsfind(async () =>
        createBetterSqlite3Executor(missingIdentity)
      )
      await assert.rejects(
        idsfind(["日"]),
        /has no recipe identity field/,
      )
    } finally {
      missingIdentity.close()
    }
  })

  test("rejects incomplete semantics manifests", async () => {
    const cases = [
      {
        label: "missing schema 1 row",
        insert: "",
        error: /has no manifest row/,
      },
      {
        label: "unsupported schema version",
        insert: `INSERT INTO idsfind_semantics VALUES (
          3, '{"version":1,"transforms":[]}'
        );`,
        error: /unsupported idsfind_semantics schema version: 3/,
      },
      {
        label: "schema 2 row in an old table shape",
        insert: `INSERT INTO idsfind_semantics VALUES (
          2, '{"version":1,"transforms":[]}'
        );`,
        error: /schema 2 has no semantics profile/,
      },
      {
        label: "invalid query plan JSON",
        insert: "INSERT INTO idsfind_semantics VALUES (1, '{');",
        error: /query plan is not valid JSON/,
      },
    ]
    for (const manifestCase of cases) {
      const db = new Database(":memory:")
      try {
        db.exec(`
          CREATE TABLE idsfind_semantics (
            schema_version INTEGER PRIMARY KEY,
            query_plan_json TEXT NOT NULL
          );
          ${manifestCase.insert}
        `)
        const executor = createBetterSqlite3Executor(db)
        const idsfind = createIdsfind(async () => executor)
        await assert.rejects(
          idsfind(["日"]),
          manifestCase.error,
          manifestCase.label,
        )
      } finally {
        db.close()
      }
    }
  })
})
