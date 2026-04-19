import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const rootDir = path.resolve(import.meta.dirname, "..")

function printUsage() {
  console.log(`Usage: node ./scripts/prepare-mojidata-d1-import.mjs [--output-dir /tmp/mojidata-d1-import]

Builds the SQLite assets if needed and writes sanitized SQL dumps that can be
imported into Cloudflare D1.`)
}

function parseArgs(argv) {
  let outputDir = path.join(os.tmpdir(), "mojidata-d1-import")
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
      outputDir = argv[index + 1]
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return { outputDir: path.resolve(outputDir) }
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

function dumpSqliteDatabase(dbPath) {
  return execFileSync("sqlite3", [dbPath, ".dump"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  })
}

function querySqlite(dbPath, sql) {
  return execFileSync("sqlite3", [dbPath, sql], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  })
}

function dumpTableAsInsertStatements(dbPath, tableName) {
  return execFileSync(
    "sqlite3",
    [dbPath, "-cmd", `.mode insert ${tableName}`, `SELECT * FROM "${tableName}";`],
    {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
    },
  )
}

function listTables(dbPath, globPattern) {
  return execFileSync(
    "sqlite3",
    [
      dbPath,
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name GLOB ${encodeSqliteStringLiteral(globPattern)} ORDER BY name`,
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

function buildUnihanMaterializationStatements(sourceDbPath) {
  const propertyTables = listTables(sourceDbPath, "unihan_k*")
  if (propertyTables.length === 0) {
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

  for (const tableName of propertyTables) {
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

function buildUnihanVariantMaterializationStatements(sourceDbPath) {
  const tables = new Set(listTables(sourceDbPath, "unihan_k*"))
  const sources = [
    ["kCompatibilityVariant", `SELECT UCS, value FROM "unihan_kCompatibilityVariant"`],
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
      `  (`,
      `    SELECT char(sum((unicode(json_extract('"\\\\u01' || e.value || '"', '$')) & 0xFF) << (8 * (2 - e.key))))`,
      `    FROM json_each(json_array(substr(value_hex, 1, 2), substr(value_hex, 3, 2), substr(value_hex, 5, 2))) AS e`,
      `  ) AS "value",`,
      `  "additional_data"`,
      `FROM t;`,
    )
  }

  return `${lines.join("\n")}\n`
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

function sanitizeDumpForD1(dumpText, { sourceDbPath } = {}) {
  const lines = dumpText.replaceAll("\r\n", "\n").split("\n")
  const kept = []
  let skippingCfKv = false
  let skippedViewName = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (skippingCfKv) {
      if (trimmed === ") WITHOUT ROWID;") {
        skippingCfKv = false
      }
      continue
    }

    if (skippedViewName) {
      if (trimmed.endsWith(";")) {
        skippedViewName = null
      }
      continue
    }

    if (trimmed === "BEGIN TRANSACTION;" || trimmed === "COMMIT;") {
      continue
    }

    if (trimmed === "CREATE TABLE _cf_KV (") {
      skippingCfKv = true
      continue
    }

    if (
      trimmed.startsWith('CREATE VIEW "unihan" AS') ||
      trimmed.startsWith('CREATE VIEW "kdpv" AS') ||
      trimmed.startsWith('CREATE VIEW "ivs" AS') ||
      trimmed.startsWith('CREATE VIEW "mjsm" AS') ||
      trimmed.startsWith('CREATE VIEW "unihan_variant" AS') ||
      trimmed.startsWith('CREATE VIEW "unihan_source" AS') ||
      trimmed.startsWith('CREATE VIEW "nyukan" AS')
    ) {
      skippedViewName = trimmed.endsWith(";") ? null : trimmed
      continue
    }

    kept.push(line)
  }

  let sanitized = replaceUnsupportedFunctionsForD1(kept.join("\n")).trimEnd()

  if (sourceDbPath) {
    const extras = [
      buildUnihanMaterializationStatements(sourceDbPath).trimEnd(),
      buildKdpvMaterializationStatements(sourceDbPath).trimEnd(),
      buildIvsMaterializationStatements(sourceDbPath).trimEnd(),
      buildMjsmMaterializationStatements(sourceDbPath).trimEnd(),
      buildUnihanVariantMaterializationStatements(sourceDbPath).trimEnd(),
      buildUnihanSourceMaterializationStatements(sourceDbPath).trimEnd(),
      buildNyukanMaterializationStatements(sourceDbPath).trimEnd(),
    ].filter(Boolean)
    if (extras.length > 0) {
      sanitized += `\n${extras.join("\n")}`
    }
  }

  return `${sanitized.trimEnd()}\n`
}

function buildIdsdbFts5ImportSql(sourceDbPath) {
  const createIdsfindTable = querySqlite(
    sourceDbPath,
    `SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'idsfind'`,
  ).trim()
  const createFtsTable = querySqlite(
    sourceDbPath,
    `SELECT sql FROM sqlite_schema WHERE name = 'idsfind_fts'`,
  ).trim()

  if (!createIdsfindTable || !createFtsTable) {
    throw new Error(`Could not read idsfind schema from ${sourceDbPath}`)
  }

  const idsfindInserts = dumpTableAsInsertStatements(sourceDbPath, "idsfind").trimEnd()
  return [
    `PRAGMA foreign_keys=OFF;`,
    `${createIdsfindTable};`,
    idsfindInserts,
    `CREATE INDEX "idsfind_UCS" ON "idsfind" ("UCS");`,
    `${createFtsTable};`,
    `INSERT INTO "idsfind_fts" (rowid, IDS_tokens)`,
    `SELECT rowid, '§ ' || group_concat(IDS_tokens, ' § ') || ' §'`,
    `FROM "idsfind"`,
    `GROUP BY UCS;`,
  ].join("\n")
}

function writeDumpFile(sourceDbPath, outputPath) {
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`Missing SQLite database file: ${sourceDbPath}`)
  }
  const sanitized = sourceDbPath.endsWith("/idsfind.db")
    ? buildIdsdbFts5ImportSql(sourceDbPath)
    : sanitizeDumpForD1(dumpSqliteDatabase(sourceDbPath), { sourceDbPath })
  fs.writeFileSync(outputPath, sanitized)
}

function writeManifest(outputDir, entries) {
  const manifestPath = path.join(outputDir, "manifest.json")
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        entries,
      },
      null,
      2,
    )}\n`,
  )
}

function main() {
  const { outputDir } = parseArgs(process.argv.slice(2))

  preparePackage(path.join(rootDir, "packages/mojidata"))
  preparePackage(path.join(rootDir, "packages/idsdb-fts5"))

  fs.mkdirSync(outputDir, { recursive: true })

  const dumpTargets = [
    {
      name: "mojidata",
      sourceDbPath: path.join(rootDir, "packages/mojidata/dist/moji.db"),
      outputPath: path.join(outputDir, "mojidata.sql"),
    },
    {
      name: "idsdb-fts5",
      sourceDbPath: path.join(rootDir, "packages/idsdb-fts5/idsfind.db"),
      outputPath: path.join(outputDir, "idsdb-fts5.sql"),
    },
  ]

  for (const target of dumpTargets) {
    console.log(`Preparing D1 import dump for ${target.name}: ${target.outputPath}`)
    writeDumpFile(target.sourceDbPath, target.outputPath)
  }

  writeManifest(
    outputDir,
    dumpTargets.map(({ name, sourceDbPath, outputPath }) => ({
      name,
      sourceDbPath,
      outputPath,
    })),
  )

  console.log(`Wrote D1 import dumps to ${outputDir}`)
}

main()
