import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
const rootDir = path.resolve(import.meta.dirname, "..")
const sqlite3Command = process.env.SQLITE3 ?? "sqlite3"

function printUsage() {
  console.log(`Usage: node ./scripts/prepare-mojidata-d1-import.mjs [--output-dir /tmp/mojidata-d1-import]
       [--mojidata-db /path/to/moji.db --idsfind-db /path/to/idsfind.db]

Builds the SQLite assets if needed and writes sanitized SQL dumps that can be
imported into Cloudflare D1. Pass both database paths to use already-built,
externally verified artifacts without rebuilding workspace packages.`)
}

function readOptionValue(argv, index) {
  const flag = argv[index]
  const value = argv[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

export function parseArgs(argv) {
  let outputDir = path.join(os.tmpdir(), "mojidata-d1-import")
  let mojidataDb
  let idsfindDb
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") {
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }
    if (arg === "--output-dir") {
      outputDir = readOptionValue(argv, index)
      index += 1
      continue
    }
    if (arg === "--mojidata-db") {
      mojidataDb = readOptionValue(argv, index)
      index += 1
      continue
    }
    if (arg === "--idsfind-db") {
      idsfindDb = readOptionValue(argv, index)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (Boolean(mojidataDb) !== Boolean(idsfindDb)) {
    throw new Error("--mojidata-db and --idsfind-db must be provided together")
  }
  return {
    outputDir: path.resolve(outputDir),
    mojidataDb: mojidataDb ? path.resolve(mojidataDb) : undefined,
    idsfindDb: idsfindDb ? path.resolve(idsfindDb) : undefined,
  }
}

function run(command, args, cwd = rootDir) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
  })
}

function preparePackage(packageDir) {
  run("bash", ["scripts/prepare"], packageDir)
}

function querySqlite(dbPath, sql) {
  return execFileSync(sqlite3Command, ["-readonly", dbPath, sql], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  })
}

function dumpTableAsInsertStatements(dbPath, tableName) {
  // SELECT * includes generated columns, which cannot be inserted. table_info
  // excludes them (unlike table_xinfo), matching SQLite's .dump behavior.
  const columns = JSON.parse(querySqlite(dbPath, `SELECT json_group_array(name)
    FROM pragma_table_info(${encodeSqliteStringLiteral(tableName)})`))
  const selectSql = `SELECT ${columns.map(name => `"${name.replaceAll('"', '""')}"`).join(',')}
    FROM "${tableName.replaceAll('"', '""')}";`
  return execFileSync(
    sqlite3Command,
    ["-readonly", dbPath, "-cmd", `.mode insert '${tableName.replaceAll("'", "''")}'`, selectSql],
    {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
    },
  )
}

function listSqliteRelations(dbPath, globPattern, types) {
  const typeList = types.map(encodeSqliteStringLiteral).join(", ")
  return execFileSync(
    sqlite3Command,
    [
      dbPath,
      `SELECT name FROM sqlite_schema WHERE type IN (${typeList}) AND name GLOB ${encodeSqliteStringLiteral(globPattern)} ORDER BY name`,
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function listTables(dbPath, globPattern) {
  return listSqliteRelations(dbPath, globPattern, ["table"])
}

function listTablesAndViews(dbPath, globPattern) {
  return listSqliteRelations(dbPath, globPattern, ["table", "view"])
}

function decodeSqliteUnistrLiteral(value) {
  return value
    .replace(/''/g, "'")
    .replace(/\\\\/g, "\\")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\\U([0-9a-fA-F]{8})/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
}

function encodeSqliteStringLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`
}

function replaceUnsupportedFunctionsForD1(text) {
  return text.replace(/unistr\('((?:[^']|'')*)'\)/g, (_, value) =>
    encodeSqliteStringLiteral(decodeSqliteUnistrLiteral(value)),
  )
}

export function buildUnihanMaterializationStatementsFromRelations(relations) {
  if (relations.length === 0) {
    return ""
  }

  const lines = [
    `CREATE TABLE "unihan" (`,
    `  "UCS" TEXT NOT NULL,`,
    `  "property" TEXT NOT NULL,`,
    `  "value" TEXT NOT NULL`,
    `);`,
    `CREATE INDEX "unihan_UCS" ON "unihan" ("UCS");`,
    `CREATE INDEX "unihan_property_UCS" ON "unihan" ("property", "UCS");`,
    `CREATE INDEX "unihan_property_value" ON "unihan" ("property", "value");`,
  ]

  for (const tableName of relations) {
    const property = tableName.slice("unihan_".length)
    lines.push(
      `INSERT INTO "unihan" ("UCS", "property", "value") ` +
        `SELECT "UCS", ${encodeSqliteStringLiteral(property)}, "value" FROM "${tableName}";`,
    )
  }

  return `${lines.join("\n")}\n`
}

function buildKdpvMaterializationStatements(sourceDbPath) {
  const relTables = listTables(sourceDbPath, "kdpv_*").filter((name) => name !== "kdpv_rels")
  if (relTables.length === 0) {
    return ""
  }

  const lines = [
    `CREATE TABLE "kdpv" (`,
    `  "subject" TEXT NOT NULL,`,
    `  "rel" TEXT NOT NULL,`,
    `  "object" TEXT NOT NULL,`,
    `  "comment" TEXT`,
    `);`,
    `CREATE INDEX "kdpv_subject" ON "kdpv" ("subject");`,
    `CREATE INDEX "kdpv_object" ON "kdpv" ("object");`,
    `CREATE INDEX "kdpv_rel_subject" ON "kdpv" ("rel", "subject");`,
  ]

  for (const tableName of relTables) {
    const rel = tableName.slice("kdpv_".length)
    lines.push(
      `INSERT INTO "kdpv" ("subject", "rel", "object", "comment") ` +
        `SELECT "subject", ${encodeSqliteStringLiteral(rel)}, "object", "comment" FROM "${tableName}";`,
    )
  }

  return `${lines.join("\n")}\n`
}

function buildIvsMaterializationStatements(sourceDbPath) {
  const tables = listTables(sourceDbPath, "ivs_*")
  if (tables.length === 0) {
    return ""
  }

  const lines = [
    `CREATE TABLE "ivs" (`,
    `  "IVS" TEXT NOT NULL,`,
    `  "collection" TEXT NOT NULL,`,
    `  "code" TEXT NOT NULL`,
    `);`,
    `CREATE INDEX "ivs_IVS" ON "ivs" ("IVS");`,
    `CREATE INDEX "ivs_collection_code" ON "ivs" ("collection", "code");`,
  ]

  for (const tableName of tables) {
    const collection = tableName.slice("ivs_".length)
    if (collection === "Adobe-Japan1") {
      lines.push(
        `INSERT INTO "ivs" ("IVS", "collection", "code") ` +
          `SELECT "IVS", 'Adobe-Japan1', 'CID+' || "CID" FROM "${tableName}";`,
      )
    } else {
      lines.push(
        `INSERT INTO "ivs" ("IVS", "collection", "code") ` +
          `SELECT "IVS", ${encodeSqliteStringLiteral(collection)}, "code" FROM "${tableName}";`,
      )
    }
  }

  return `${lines.join("\n")}\n`
}

function buildMjsmMaterializationStatements(sourceDbPath) {
  const tables = listTables(sourceDbPath, "mjsm_*").filter((name) => name !== "mjsm_note")
  if (tables.length === 0) {
    return ""
  }

  const lines = [
    `CREATE TABLE "mjsm" (`,
    `  "MJ文字図形名" TEXT NOT NULL,`,
    `  "縮退UCS" TEXT NOT NULL,`,
    `  "縮退X0213" TEXT NOT NULL,`,
    `  "表" TEXT NOT NULL,`,
    `  "順位" INTEGER,`,
    `  "ホップ数" INTEGER`,
    `);`,
    `CREATE INDEX "mjsm_MJ文字図形名" ON "mjsm" ("MJ文字図形名");`,
    `CREATE INDEX "mjsm_縮退UCS" ON "mjsm" ("縮退UCS");`,
    `CREATE INDEX "mjsm_表" ON "mjsm" ("表");`,
  ]

  for (const tableName of tables) {
    const label = tableName.slice("mjsm_".length)
    if (label === "法務省告示582号別表第四_一" || label === "法務省告示582号別表第四_二") {
      lines.push(
        `INSERT INTO "mjsm" ("MJ文字図形名", "縮退UCS", "縮退X0213", "表", "順位", "ホップ数") ` +
          `SELECT "MJ文字図形名", "縮退UCS", "縮退X0213", ${encodeSqliteStringLiteral(label)}, "順位", NULL FROM "${tableName}";`,
      )
      continue
    }
    if (label === "戸籍統一文字情報_親字正字") {
      lines.push(
        `INSERT INTO "mjsm" ("MJ文字図形名", "縮退UCS", "縮退X0213", "表", "順位", "ホップ数") ` +
          `SELECT "MJ文字図形名", "縮退UCS", "縮退X0213", ${encodeSqliteStringLiteral(label)}, NULL, "ホップ数" FROM "${tableName}";`,
      )
      continue
    }
    lines.push(
      `INSERT INTO "mjsm" ("MJ文字図形名", "縮退UCS", "縮退X0213", "表", "順位", "ホップ数") ` +
        `SELECT "MJ文字図形名", "縮退UCS", "縮退X0213", ${encodeSqliteStringLiteral(label)}, NULL, NULL FROM "${tableName}";`,
    )
  }

  return `${lines.join("\n")}\n`
}

export function buildUnihanVariantMaterializationStatementsFromRelations(relations) {
  const tables = new Set(relations)
  const sources = [
    ["kCompatibilityVariant", `SELECT UCS, value FROM "unihan_kCompatibilityVariant"`],
    ["kJapaneseNewVariant", `SELECT UCS, value FROM "unihan_kJapaneseNewVariant"`],
    ["kJapaneseOldVariant", `SELECT UCS, value FROM "unihan_kJapaneseOldVariant"`],
    ["kSemanticVariant", `SELECT UCS, value FROM "unihan_kSemanticVariant"`],
    ["kSimplifiedVariant", `SELECT UCS, value FROM "unihan_kSimplifiedVariant"`],
    ["kSpecializedSemanticVariant", `SELECT UCS, value FROM "unihan_kSpecializedSemanticVariant"`],
    ["kSpoofingVariant", `SELECT UCS, value FROM "unihan_kSpoofingVariant"`],
    ["kTraditionalVariant", `SELECT UCS, value FROM "unihan_kTraditionalVariant"`],
    ["kZVariant", `SELECT UCS, value FROM "unihan_kZVariant"`],
    ["kJoyoKanji", `SELECT UCS, value FROM "unihan_kJoyoKanji" WHERE value GLOB 'U+*'`],
    [
      "kJinmeiyoKanji",
      `SELECT UCS, substr(value, 6) AS value FROM "unihan_kJinmeiyoKanji" WHERE value GLOB '20??:U+*'`,
    ],
  ].filter(([property]) => tables.has(`unihan_${property}`))

  if (sources.length === 0) {
    return ""
  }

  const lines = [
    `CREATE TABLE "unihan_variant" (`,
    `  "UCS" TEXT NOT NULL,`,
    `  "property" TEXT NOT NULL,`,
    `  "value" TEXT NOT NULL,`,
    `  "additional_data" TEXT`,
    `);`,
    `CREATE INDEX "unihan_variant_UCS" ON "unihan_variant" ("UCS");`,
    `CREATE INDEX "unihan_variant_value" ON "unihan_variant" ("value");`,
    `CREATE INDEX "unihan_variant_property_UCS" ON "unihan_variant" ("property", "UCS");`,
  ]

  for (const [property, sourceSql] of sources) {
    lines.push(
      `INSERT INTO "unihan_variant" ("UCS", "property", "value", "additional_data")`,
      `WITH u AS (`,
      `  SELECT`,
      `    "UCS",`,
      `    ${encodeSqliteStringLiteral(property)} AS "property",`,
      `    CASE WHEN instr(e.value, '<') THEN substr(e.value, 1, instr(e.value, '<') - 1) ELSE e.value END AS raw_value,`,
      `    CASE WHEN instr(e.value, '<') THEN substr(e.value, instr(e.value, '<') + 1) END AS additional_data`,
      `  FROM (${sourceSql}) AS k`,
      `  JOIN json_each('["' || replace(k.value, ' ', '","') || '"]') AS e`,
      `), t AS (`,
      `  SELECT "UCS", "property", "additional_data", substr('00' || substr(raw_value, 3), -6) AS value_hex`,
      `  FROM u`,
      `)`,
      `SELECT`,
      `  "UCS",`,
      `  "property",`,
      `  char(`,
      `    (instr('0123456789ABCDEF', substr(value_hex, 1, 1)) - 1) * 1048576 +`,
      `    (instr('0123456789ABCDEF', substr(value_hex, 2, 1)) - 1) * 65536 +`,
      `    (instr('0123456789ABCDEF', substr(value_hex, 3, 1)) - 1) * 4096 +`,
      `    (instr('0123456789ABCDEF', substr(value_hex, 4, 1)) - 1) * 256 +`,
      `    (instr('0123456789ABCDEF', substr(value_hex, 5, 1)) - 1) * 16 +`,
      `    (instr('0123456789ABCDEF', substr(value_hex, 6, 1)) - 1)`,
      `  ) AS "value",`,
      `  "additional_data"`,
      `FROM t;`,
    )
  }

  return `${lines.join("\n")}\n`
}

export function buildUnihanMaterializationStatements(sourceDbPath) {
  return buildUnihanMaterializationStatementsFromRelations(
    listTablesAndViews(sourceDbPath, "unihan_k*"),
  )
}

function buildUnihanVariantMaterializationStatements(sourceDbPath) {
  return buildUnihanVariantMaterializationStatementsFromRelations(
    listTablesAndViews(sourceDbPath, "unihan_k*"),
  )
}

function buildUnihanSourceMaterializationStatements(sourceDbPath) {
  const sourceTables = listTables(sourceDbPath, "unihan_kIRG_*Source")
  if (sourceTables.length === 0) {
    return ""
  }

  const lines = [
    `CREATE TABLE "unihan_source" (`,
    `  "UCS" TEXT NOT NULL,`,
    `  "source" TEXT NOT NULL,`,
    `  "value" TEXT NOT NULL`,
    `);`,
    `CREATE INDEX "unihan_source_UCS" ON "unihan_source" ("UCS");`,
    `CREATE INDEX "unihan_source_source" ON "unihan_source" ("source");`,
  ]

  for (const tableName of sourceTables) {
    const source = tableName.replace(/^unihan_kIRG_(.+)Source$/, "$1")
    lines.push(
      `INSERT INTO "unihan_source" ("UCS", "source", "value") ` +
        `SELECT "UCS", ${encodeSqliteStringLiteral(source)}, "value" FROM "${tableName}";`,
    )
  }

  return `${lines.join("\n")}\n`
}

function buildNyukanMaterializationStatements(sourceDbPath) {
  const tables = new Set(listTables(sourceDbPath, "nyukan_*"))
  if (!tables.has("nyukan_itaiji") && !tables.has("nyukan_ruiji")) {
    return ""
  }

  const lines = [
    `CREATE TABLE "nyukan" (`,
    `  "正字の種類" TEXT NOT NULL,`,
    `  "簡体字等の文字コード等" TEXT,`,
    `  "簡体字等のUCS" TEXT,`,
    `  "正字の文字コード等" TEXT,`,
    `  "正字のUCS" TEXT,`,
    `  "順位" INTEGER`,
    `);`,
    `CREATE INDEX "nyukan_簡体字等のUCS" ON "nyukan" ("簡体字等のUCS");`,
    `CREATE INDEX "nyukan_正字のUCS" ON "nyukan" ("正字のUCS");`,
  ]

  if (tables.has("nyukan_itaiji")) {
    lines.push(
      `INSERT INTO "nyukan" ("正字の種類", "簡体字等の文字コード等", "簡体字等のUCS", "正字の文字コード等", "正字のUCS", "順位") ` +
        `SELECT '異体字', "簡体字等の文字コード等", "簡体字等のUCS", "正字の文字コード等", "正字のUCS", "順位" FROM "nyukan_itaiji";`,
    )
  }
  if (tables.has("nyukan_ruiji")) {
    lines.push(
      `INSERT INTO "nyukan" ("正字の種類", "簡体字等の文字コード等", "簡体字等のUCS", "正字の文字コード等", "正字のUCS", "順位") ` +
        `SELECT '類字', "簡体字等の文字コード等", "簡体字等のUCS", "正字の文字コード等", "正字のUCS", "順位" FROM "nyukan_ruiji";`,
    )
  }

  return `${lines.join("\n")}\n`
}

// Keep D1 work to empty-schema creation and literal inserts. In particular,
// neither view expansion nor index backfills should scan uploaded tables.
export const importRecipe = "literal-values-indexes-first-v1"

function readSchema(sourceDbPath) {
  return JSON.parse(querySqlite(sourceDbPath, `
    SELECT json_group_array(json_object('type', type, 'name', name, 'table', tbl_name, 'sql', sql))
    FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV'
    ORDER BY name
  `))
}

function countRows(sourceDbPath, table) {
  return Number(querySqlite(sourceDbPath, `SELECT count(*) FROM "${table.replaceAll('"', '""')}"`))
}

function indexCount(sourceDbPath, table) {
  // Include implicit primary-key/unique indexes as well as explicit indexes.
  // Partial indexes are omitted from this lower bound, since not every row
  // contributes an index entry.
  return Number(querySqlite(sourceDbPath, `SELECT count(*) FROM
    pragma_index_list(${encodeSqliteStringLiteral(table)}) WHERE partial = 0`))
}

function writeSql(outputPath, text, append = true) {
  const sql = replaceUnsupportedFunctionsForD1(text).trimEnd() + "\n"
  if (append) fs.appendFileSync(outputPath, sql)
  else fs.writeFileSync(outputPath, sql)
}

function materializedRelations(sourceDbPath, schema) {
  const builders = [
    ['unihan', buildUnihanMaterializationStatements],
    ['kdpv', buildKdpvMaterializationStatements],
    ['ivs', buildIvsMaterializationStatements],
    ['mjsm', buildMjsmMaterializationStatements],
    ['unihan_variant', buildUnihanVariantMaterializationStatements],
    ['unihan_source', buildUnihanSourceMaterializationStatements],
    ['nyukan', buildNyukanMaterializationStatements],
  ]
  return builders.flatMap(([name, build]) => {
    if (!schema.some(row => row.type === 'view' && row.name === name)) return []
    const oldPlan = build(sourceDbPath)
    const insertStart = oldPlan.indexOf('INSERT INTO')
    if (insertStart < 0) throw new Error(`Cannot materialize source view ${name}`)
    // Only the schema is retained. Values come from the source view locally,
    // so the exported data follows the published DB, not another property list.
    return [{ name, ddl: oldPlan.slice(0, insertStart) }]
  })
}

function writeMojidataImport(sourceDbPath, outputPath) {
  const schema = readSchema(sourceDbPath)
  if (schema.some(row => row.type === 'trigger' || /CREATE VIRTUAL TABLE/i.test(row.sql))) {
    throw new Error('Unsupported trigger or virtual table in mojidata source; review its import cost first')
  }
  const materialized = materializedRelations(sourceDbPath, schema)
  const names = new Set(materialized.map(row => row.name))
  const tables = schema.filter(row => row.type === 'table')
  writeSql(outputPath, 'PRAGMA foreign_keys=OFF;', false)
  for (const row of tables) writeSql(outputPath, row.sql + ';')
  // All indexes are installed while their tables are empty.
  for (const row of schema.filter(row => row.type === 'index')) writeSql(outputPath, row.sql + ';')
  for (const row of materialized) writeSql(outputPath, row.ddl)
  for (const row of schema.filter(row => row.type === 'view' && !names.has(row.name))) {
    writeSql(outputPath, row.sql + ';')
  }

  const counts = []
  for (const row of [...tables, ...materialized]) {
    const rows = countRows(sourceDbPath, row.name)
    const indexes = row.ddl
      ? (row.ddl.match(/CREATE INDEX/g) ?? []).length
      : indexCount(sourceDbPath, row.name)
    writeSql(outputPath, dumpTableAsInsertStatements(sourceDbPath, row.name))
    counts.push({ table: row.name, rows, indexes })
  }
  return { recipe: importRecipe, dataRows: counts.reduce((sum, row) => sum + row.rows, 0),
    minimumRowsWritten: counts.reduce((sum, row) => sum + row.rows * (1 + row.indexes), 0),
    tables: counts }
}

function writeIdsdbFts5Import(sourceDbPath, outputPath) {
  const schema = readSchema(sourceDbPath)
  const idsfind = schema.find(row => row.name === 'idsfind' && row.type === 'table')
  const fts = schema.find(row => row.name === 'idsfind_fts' && /CREATE VIRTUAL TABLE/i.test(row.sql))
  if (!idsfind || !fts) throw new Error(`Could not read idsfind schema from ${sourceDbPath}`)
  writeSql(outputPath, `PRAGMA foreign_keys=OFF;\n${idsfind.sql};
CREATE INDEX "idsfind_UCS" ON "idsfind" ("UCS");
${fts.sql};`, false)
  // Preserve rowids: FTS result rowids point into idsfind.
  const columns = JSON.parse(querySqlite(sourceDbPath,
    `SELECT json_group_array(name) FROM pragma_table_info('idsfind')`))
  const quoted = columns.map(name => `quote("${name.replaceAll('"', '""')}")`)
  writeSql(outputPath, querySqlite(sourceDbPath, `SELECT
    'INSERT INTO "idsfind" (rowid,${columns.map(name => '"' + name.replaceAll('"', '""') + '"').join(',')}) VALUES(' || quote(rowid) || ',' ||
    ${quoted.join(" || ',' || ")} || ');' FROM idsfind ORDER BY rowid`))
  // GROUP BY and token concatenation run on the local artifact, never on D1.
  writeSql(outputPath, querySqlite(sourceDbPath, `SELECT
    'INSERT INTO "idsfind_fts" (rowid, IDS_tokens) VALUES(' || quote(rowid) || ',' ||
    quote('§ ' || group_concat(IDS_tokens, ' § ') || ' §') || ');'
    FROM idsfind GROUP BY UCS`))
  const rows = countRows(sourceDbPath, 'idsfind')
  const ftsRows = Number(querySqlite(sourceDbPath, 'SELECT count(DISTINCT UCS) FROM idsfind'))
  return { recipe: importRecipe, dataRows: rows + ftsRows,
    // FTS segment maintenance adds further writes; this is a lower bound.
    minimumRowsWritten: rows * 2 + ftsRows,
    tables: [{ table: 'idsfind', rows }, { table: 'idsfind_fts', rows: ftsRows }] }
}

export function isIdsfindDbPath(sourceDbPath) {
  return ["idsfind.db", "idsfind-fts5.db"].includes(
    sourceDbPath.split(/[\\/]/).at(-1),
  )
}

export function writeDumpFile(sourceDbPath, outputPath) {
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`Missing SQLite database file: ${sourceDbPath}`)
  }
  return isIdsfindDbPath(sourceDbPath)
    ? writeIdsdbFts5Import(sourceDbPath, outputPath)
    : writeMojidataImport(sourceDbPath, outputPath)
}

function writeManifest(outputDir, entries) {
  const manifestPath = path.join(outputDir, "manifest.json")
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        formatVersion: 2,
        generatedAt: new Date().toISOString(),
        entries,
      },
      null,
      2,
    )}\n`,
  )
}

function fileSha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function main() {
  const { outputDir, mojidataDb, idsfindDb } = parseArgs(process.argv.slice(2))

  if (!mojidataDb) {
    preparePackage(path.join(rootDir, "packages/mojidata"))
    preparePackage(path.join(rootDir, "packages/idsdb-fts5"))
  }

  fs.mkdirSync(outputDir, { recursive: true })

  const dumpTargets = [
    {
      name: "mojidata",
      sourceDbPath:
        mojidataDb ?? path.join(rootDir, "packages/mojidata/dist/moji.db"),
      outputPath: path.join(outputDir, "mojidata.sql"),
    },
    {
      name: "idsdb-fts5",
      sourceDbPath:
        idsfindDb ?? path.join(rootDir, "packages/idsdb-fts5/idsfind.db"),
      outputPath: path.join(outputDir, "idsdb-fts5.sql"),
    },
  ]

  for (const target of dumpTargets) {
    console.log(`Preparing D1 import dump for ${target.name}: ${target.outputPath}`)
    target.importPlan = writeDumpFile(target.sourceDbPath, target.outputPath)
  }

  writeManifest(
    outputDir,
    dumpTargets.map(({ name, sourceDbPath, outputPath, importPlan }) => {
      const sourceStat = fs.statSync(sourceDbPath)
      const outputStat = fs.statSync(outputPath)
      return {
        name,
        sourceDbPath,
        sourceByteLength: sourceStat.size,
        sourceSha256: fileSha256(sourceDbPath),
        outputPath,
        outputByteLength: outputStat.size,
        outputSha256: fileSha256(outputPath),
        importPlan,
      }
    }),
  )

  console.log(`Wrote D1 import dumps to ${outputDir}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
