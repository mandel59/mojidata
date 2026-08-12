import assert from "node:assert/strict"
import { describe, test } from "node:test"

import Database from "better-sqlite3"

import {
  collectIdsFtsFeatures,
  idsFtsFeatureVersion,
} from "@mandel59/idsdb-utils"
import {
  createIdsfind,
  createStructuralFtsIdsfindCandidateProvider,
  ftsIdsfindCandidateProvider,
} from "@mandel59/mojidata-api-core"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"

import { createBetterSqlite3Executor } from "../index"

describe("idsfind structural FTS", () => {
  test("F2 and F5 remove structural false positives without changing answers", async () => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE VIRTUAL TABLE idsfind_fts USING fts5 (
        IDS_tokens,
        content='',
        tokenize="unicode61 tokenchars '§⿰⿱'"
      );
      CREATE VIRTUAL TABLE idsfind_structural_fts USING fts5 (
        IDS_features,
        content='',
        tokenize='unicode61'
      );
      CREATE TABLE idsfind_structural_meta (
        schema_version INTEGER PRIMARY KEY,
        feature_version TEXT NOT NULL,
        families TEXT NOT NULL
      );
    `)
    db.prepare(
      "INSERT INTO idsfind_structural_meta VALUES (1, ?, 'root,edge,equality')",
    )
      .run(idsFtsFeatureVersion)
    const rows = [
      ["甲", "⿱ 木 ⿰ 木 木"],
      ["乙", "⿱ ⿰ 木 木 木"],
      ["丙", "⿱ 木 ⿰ 木 日"],
    ] as const
    const insertIds = db.prepare("INSERT INTO idsfind VALUES (?, ?)")
    const insertFts = db.prepare(
      "INSERT INTO idsfind_fts (rowid, IDS_tokens) VALUES (?, ?)",
    )
    const insertStructural = db.prepare(
      "INSERT INTO idsfind_structural_fts (rowid, IDS_features) VALUES (?, ?)",
    )
    rows.forEach(([ucs, tokens], index) => {
      const rowid = index + 1
      insertIds.run(ucs, tokens)
      insertFts.run(rowid, `§ ${tokens} §`)
      insertStructural.run(
        rowid,
        collectIdsFtsFeatures(tokens.split(" "), {
          families: ["root", "edge", "equality"],
        }).join(" "),
      )
    })

    const executor = createBetterSqlite3Executor(db)
    const query = ["§⿱x⿰xx§"]
    const tokenized = tokenizeIdsList(query)
    const f1 = createStructuralFtsIdsfindCandidateProvider(["root"])
    const f2 = createStructuralFtsIdsfindCandidateProvider(["root", "edge"])
    const f5 = createStructuralFtsIdsfindCandidateProvider([
      "root",
      "edge",
      "equality",
    ])

    assert.deepEqual(
      await ftsIdsfindCandidateProvider.getCandidates(
        executor,
        tokenized.forQuery,
        tokenized.forAudit,
      ),
      ["甲", "乙", "丙"],
    )
    assert.deepEqual(
      await f1.getCandidates(executor, tokenized.forQuery, tokenized.forAudit),
      ["甲", "乙", "丙"],
    )
    assert.deepEqual(
      await f2.getCandidates(executor, tokenized.forQuery, tokenized.forAudit),
      ["甲", "丙"],
    )
    assert.deepEqual(
      await f5.getCandidates(executor, tokenized.forQuery, tokenized.forAudit),
      ["甲"],
    )

    const f0Search = createIdsfind(async () => executor)
    const f2Search = createIdsfind(async () => executor, f2)
    const f5Search = createIdsfind(async () => executor, f5)
    assert.deepEqual(await f0Search(query), ["甲"])
    assert.deepEqual(await f2Search(query), ["甲"])
    assert.deepEqual(await f5Search(query), ["甲"])
    db.close()
  })

  test("rejects an index missing a requested feature family", async () => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE VIRTUAL TABLE idsfind_fts USING fts5 (IDS_tokens, content='');
      CREATE TABLE idsfind_structural_meta (
        schema_version INTEGER PRIMARY KEY,
        feature_version TEXT NOT NULL,
        families TEXT NOT NULL
      );
    `)
    db.prepare("INSERT INTO idsfind_structural_meta VALUES (1, ?, 'root')")
      .run(idsFtsFeatureVersion)
    const executor = createBetterSqlite3Executor(db)
    const f2 = createStructuralFtsIdsfindCandidateProvider(["root", "edge"])
    await assert.rejects(
      f2.getCandidates(executor, tokenizeIdsList(["§⿱x⿰xx§"]).forQuery),
      /does not provide root,edge/,
    )
    db.close()
  })
})
