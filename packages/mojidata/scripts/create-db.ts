import fs from "fs"
import path from "path"
import { promisify } from "util"
import parse from "csv-parse"
import Database, { Statement } from "better-sqlite3"
import { format as formatSQL } from "sql-formatter"
import { transaction } from "./lib/dbutils"
import joyoKanjiHyo from "@mandel59/joyokanjihyo"
import nyukanseiji from "@mandel59/nyukanseiji"

const format = (sql: string) => {
    return formatSQL(sql, { language: 'mysql' });
}

const dbpath = path.join(__dirname, "../dist/moji.db")

function parseUCS(code: string) {
    return String.fromCodePoint(parseInt(code.slice(2), 16))
}

function parseVS(code: string) {
    return String.fromCodePoint(...code.split('_').map(code => parseInt(code, 16)))
}

async function createMji(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "mji"`)
    db.exec(format(`CREATE TABLE "mji" (
        "MJ文字図形名" TEXT PRIMARY KEY,
        "対応するUCS" TEXT,
        "実装したUCS" TEXT,
        "実装したMoji_JohoコレクションIVS" TEXT,
        "実装したSVS" TEXT,
        "戸籍統一文字番号" TEXT,
        "住基ネット統一文字コード" TEXT,
        "入管正字コード" TEXT,
        "入管外字コード" TEXT,
        "漢字施策" TEXT,
        "対応する互換漢字" TEXT,
        "X0213" TEXT,
        "X0213_包摂連番" TEXT,
        "X0213_包摂区分" INTEGER,
        "X0212" TEXT,
        "MJ文字図形バージョン" TEXT,
        "登記統一文字番号" TEXT,
        "総画数" INTEGER,
        "大漢和" INTEGER,
        "日本語漢字辞典" INTEGER,
        "新大字典" INTEGER,
        "大字源" INTEGER,
        "大漢語林" INTEGER,
        "備考" TEXT
    )`))

    db.exec(`drop table if exists "mji_reading"`)
    db.exec(format(`CREATE TABLE "mji_reading" (
        "MJ文字図形名" TEXT NOT NULL,
        "読み" TEXT NOT NULL
    )`))

    db.exec(`drop table if exists "mji_rsindex"`)
    db.exec(format(`CREATE TABLE "mji_rsindex" (
        "MJ文字図形名" TEXT NOT NULL,
        "部首" INTEGER NOT NULL,
        "内画数" INTEGER NOT NULL
    )`))

    db.exec(`drop table if exists "mji_changelog"`)
    db.exec(format(`CREATE TABLE "mji_changelog" (
        "MJ文字図形名" TEXT NOT NULL,
        "更新履歴" TEXT NOT NULL
    )`))

    const mjipath = path.join(__dirname, "../resources/mji/mji.00601.csv")
    const stream = fs.createReadStream(mjipath).pipe(parse({
        columns: true,
        cast: (value, { column }) => {
            if (!value) return null
            if (column === "対応するUCS"
                || column === "実装したUCS"
                || column === "対応する互換漢字") {
                return parseUCS(value)
            }
            if (column === "実装したMoji_JohoコレクションIVS"
                || column === "実装したSVS") {
                return parseVS(value)
            }
            return value
        }
    }))
    const columns = [
        "MJ文字図形名",
        "対応するUCS",
        "実装したUCS",
        "実装したMoji_JohoコレクションIVS",
        "実装したSVS",
        "戸籍統一文字番号",
        "住基ネット統一文字コード",
        "入管正字コード",
        "入管外字コード",
        "漢字施策",
        "対応する互換漢字",
        "X0213",
        "X0213 包摂連番",
        "X0213 包摂区分",
        "X0212",
        "MJ文字図形バージョン",
        "登記統一文字番号(参考)",
        "総画数(参考)",
        "大漢和",
        "日本語漢字辞典",
        "新大字典",
        "大字源",
        "大漢語林",
        "備考",
    ]
    function renameColumns(column: string) {
        return column
            .replace(/ /g, "_")
            .replace(/\(参考\)$/, "")
    }
    function quote(x: string) {
        return `"${x}"`
    }
    const insert = db.prepare(
        `INSERT INTO "mji" (${columns.map(renameColumns).map(quote).join(",")})
        VALUES (${columns.map(() => "?").join(",")})`)
    const insert_reading = db.prepare(
        `INSERT INTO "mji_reading" ("MJ文字図形名", "読み")
        VALUES (?, ?)`)
    const insert_rsindex = db.prepare(
        `INSERT INTO "mji_rsindex" ("MJ文字図形名", "部首", "内画数")
        VALUES (?, ?, ?)`)
    const insert_changelog = db.prepare(
        `INSERT INTO "mji_changelog" ("MJ文字図形名", "更新履歴")
        VALUES (?, ?)`)

    await transaction(db, async () => {
        const radicalKey = [1, 2, 3, 4].map(i => `部首${i}(参考)`)
        const strokeKey = [1, 2, 3, 4].map(i => `内画数${i}(参考)`)
        for await (const row of stream) {
            insert.run(columns.map(column => row[column]))
            if (row["読み(参考)"]) {
                const readings = row["読み(参考)"].split(/・/g)
                for (const reading of readings) {
                    insert_reading.run([row["MJ文字図形名"], reading])
                }
            }
            if (row["更新履歴"]) {
                const changelog = row["更新履歴"].split(/;/g)
                for (const entry of changelog) {
                    insert_changelog.run([row["MJ文字図形名"], entry])
                }
            }
            for (let i = 0; i < 4; i++) {
                if (row[radicalKey[i]] && row[strokeKey[i]]) {
                    insert_rsindex.run([row["MJ文字図形名"], row[radicalKey[i]], row[strokeKey[i]]])
                }
            }
        }
    })

    db.exec(`CREATE INDEX "mji_対応するUCS" ON "mji" ("対応するUCS")`)
    db.exec(`CREATE INDEX "mji_実装したUCS" ON "mji" ("実装したUCS")`)
    db.exec(`CREATE INDEX "mji_実装したMoji_JohoコレクションIVS" ON "mji" ("実装したMoji_JohoコレクションIVS")`)
    db.exec(`CREATE INDEX "mji_実装したSVS" ON "mji" ("実装したSVS")`)
    db.exec(`CREATE INDEX "mji_対応する互換漢字" ON "mji" ("対応する互換漢字")`)
    db.exec(`CREATE INDEX "mji_reading_MJ文字図形名" ON "mji_reading" ("MJ文字図形名")`)
    db.exec(`CREATE INDEX "mji_reading_読み" ON "mji_reading" ("読み")`)
    db.exec(`CREATE INDEX "mji_rsindex_MJ文字図形名" ON "mji_rsindex" ("MJ文字図形名")`)
    db.exec(`CREATE INDEX "mji_rsindex_部首_内画数" ON "mji_rsindex" ("部首", "内画数")`)
    db.exec(`CREATE INDEX "mji_changelog_MJ文字図形名" ON "mji_changelog" ("MJ文字図形名")`)
}

async function createMjsm(db: import("better-sqlite3").Database) {
    const tables = [
        "JIS包摂規準UCS統合規則",
        "法務省告示582号別表第四_一",
        "法務省告示582号別表第四_二",
        "戸籍統一文字情報_親字正字",
        "民一2842号通達別表_誤字俗字正字一覧表_俗字",
        "民一2842号通達別表_誤字俗字正字一覧表_別字",
        "民一2842号通達別表_誤字俗字正字一覧表_無印",
        "民二5202号通知別表_正字俗字等対照表",
        "読み字形による類推",
        "辞書類等による関連字",
    ]

    const insert = Object.fromEntries(tables.map(table => {
        db.exec(`drop table if exists "mjsm_${table}"`)
        if (table === "法務省告示582号別表第四_一"
            || table === "法務省告示582号別表第四_二") {
            db.exec(format(`CREATE TABLE "mjsm_${table}" (
                "MJ文字図形名" TEXT NOT NULL,
                "縮退UCS" TEXT NOT NULL,
                "縮退X0213" TEXT NOT NULL,
                "順位" INTEGER NOT NULL
            )`))
            const insert = db.prepare(
                `INSERT INTO "mjsm_${table}"
                ("MJ文字図形名", "縮退UCS", "縮退X0213", "順位")
                VALUES (@mj, @ucs, @x0213, @rank)`)
            return [table, insert]
        } else if (table === "戸籍統一文字情報_親字正字") {
            db.exec(format(`CREATE TABLE "mjsm_${table}" (
                "MJ文字図形名" TEXT NOT NULL,
                "縮退UCS" TEXT NOT NULL,
                "縮退X0213" TEXT NOT NULL,
                "ホップ数" INTEGER NOT NULL
            )`))
            const insert = db.prepare(
                `INSERT INTO "mjsm_${table}"
                ("MJ文字図形名", "縮退UCS", "縮退X0213", "ホップ数")
                VALUES (@mj, @ucs, @x0213, @hop)`)
            return [table, insert]
        } else {
            db.exec(format(`CREATE TABLE "mjsm_${table}" (
                "MJ文字図形名" TEXT NOT NULL,
                "縮退UCS" TEXT NOT NULL,
                "縮退X0213" TEXT NOT NULL
            )`))
            const insert = db.prepare(
                `INSERT INTO "mjsm_${table}"
                ("MJ文字図形名", "縮退UCS", "縮退X0213")
                VALUES (@mj, @ucs, @x0213)`)
            return [table, insert]
        }
    }))

    db.exec(`drop table if exists "mjsm_note"`)
    db.exec(format(`CREATE TABLE "mjsm_note" (
        "MJ文字図形名" TEXT PRIMARY KEY,
        "参考情報" TEXT
    )`))
    const insert_note = db.prepare(
        `INSERT INTO "mjsm_note" ("MJ文字図形名", "参考情報")
        VALUES (?, ?)`)

    const shrinkmap = JSON.parse((await promisify(fs.readFile)(path.join(__dirname, "../resources/mjsm/MJShrinkMap.1.2.0.json"))).toString())
    const ruleKeys = ["JIS包摂規準・UCS統合規則", "法務省戸籍法関連通達・通知", "法務省告示582号別表第四", "辞書類等による関連字", "読み・字形による類推"]
    await transaction(db, async () => {
        for (const record of shrinkmap.content) {
            const MJ文字図形名 = record["MJ文字図形名"]
            const 参考情報 = record["参考情報"]
            if (参考情報) {
                insert_note.run([MJ文字図形名, 参考情報])
            }
            for (const rule of ruleKeys) {
                const mappings = record[rule]
                if (mappings) {
                    for (const mapping of mappings) {
                        const 縮退X0213 = mapping["JIS X 0213"]
                        const 縮退UCS = parseUCS(mapping["UCS"])
                        const 規則 = rule
                        const 種別 = mapping["種別"]
                        const 表 = mapping["表"]
                        const 付記 = mapping["付記"]
                        const ホップ数 = mapping["ホップ数"]
                        const 順位 = mapping["順位"]
                        const table = [種別 || 規則, 表 || 付記]
                            .filter(x => x)
                            .join("_")
                            .replace(/ /g, '_')
                            .replace(/・/g, '')
                        insert[table].run({
                            mj: MJ文字図形名,
                            ucs: 縮退UCS,
                            x0213: 縮退X0213,
                            hop: ホップ数,
                            rank: 順位 ? 順位[1] : undefined
                        })
                    }
                }
            }
        }
    })

    for (const table of tables) {
        db.exec(`CREATE INDEX "mjsm_${table}_MJ文字図形名" ON "mjsm_${table}" ("MJ文字図形名")`)
        db.exec(`CREATE INDEX "mjsm_${table}_縮退UCS" ON "mjsm_${table}" ("縮退UCS")`)
        db.exec(`CREATE INDEX "mjsm_${table}_縮退X0213" ON "mjsm_${table}" ("縮退X0213")`)
    }

    db.exec(`drop view if exists "mjsm"`)
    db.exec(format(
        `CREATE VIEW "mjsm" AS\n`
        + tables.map(table => {
            if (table === "法務省告示582号別表第四_一"
                || table === "法務省告示582号別表第四_二") {
                return `SELECT
                    "MJ文字図形名",
                    "縮退UCS",
                    "縮退X0213",
                    '${table}' AS "表",
                    "順位",
                    NULL AS "ホップ数"
                    FROM "mjsm_${table}"`
            } else if (table === "戸籍統一文字情報_親字正字") {
                return `SELECT
                    "MJ文字図形名",
                    "縮退UCS",
                    "縮退X0213",
                    '${table}' AS "表",
                    NULL AS "順位",
                    "ホップ数"
                    FROM "mjsm_${table}"`
            } else {
                return `SELECT
                    "MJ文字図形名",
                    "縮退UCS",
                    "縮退X0213",
                    '${table}' AS "表",
                    NULL AS "順位",
                    NULL AS "ホップ数"
                    FROM "mjsm_${table}"`
            }
        }).join(`\nUNION ALL\n`)))
}

async function createIvs(db: import("better-sqlite3").Database) {
    db.exec(`create temporary table "tempivs" (
        "IVS" TEXT NOT NULL,
        "collection" TEXT NOT NULL,
        "code" TEXT NOT NULL
    )`)
    const insert = db.prepare(
        `INSERT INTO "tempivs" ("IVS", "collection", "code")
        VALUES (?, ?, ?)`)

    const mjipath = path.join(__dirname, "../resources/unicode/ivs.csv")
    const stream = fs.createReadStream(mjipath).pipe(parse({
        columns: true
    }))

    await transaction(db, async () => {
        for await (const record of stream) {
            insert.run([
                parseVS(record["IVS"]),
                record["collection"],
                record["code"]
            ])
        }
    })

    const collections = db.prepare("select distinct collection from tempivs").pluck().all()

    for (const table of db.prepare(
        `select tbl_name
        from sqlite_master
        where type = 'table' and tbl_name glob 'ivs_*'`
    ).pluck().all() as string[]) {
        db.exec(`drop table if exists "${table.replace(/"/g, '""')}"`)
    }

    for (const collection of collections) {
        if (collection === "Adobe-Japan1") {
            db.exec(format(`CREATE TABLE "ivs_${collection}" (
                "IVS" TEXT PRIMARY KEY,
                "CID" INTEGER NOT NULL
            )`))
            db.exec(`insert into "ivs_${collection}" (IVS, CID)
                select IVS, cast(substr(code, 5) as integer) from tempivs where collection = 'Adobe-Japan1'`)
            db.exec(`CREATE INDEX "ivs_${collection}_CID" ON "ivs_${collection}" ("CID")`)
        } else {
            db.exec(format(`CREATE TABLE "ivs_${collection}" (
                "IVS" TEXT PRIMARY KEY,
                "code" TEXT NOT NULL
            )`))
            db.exec(`insert into "ivs_${collection}" ("IVS", "code")
                select IVS, code from tempivs where collection = '${collection}'`)
            db.exec(`CREATE INDEX "ivs_${collection}_code" ON "ivs_${collection}" ("code")`)
        }
    }

    db.exec(`drop view if exists "ivs"`)
    db.exec(`CREATE VIEW "ivs" AS `
        + `SELECT IVS, 'Adobe-Japan1' AS collection, 'CID+' || CID AS code FROM "ivs_Adobe-Japan1"`
        + ` UNION ALL `
        + collections
            .filter(collection => collection !== "Adobe-Japan1")
            .map(collection => `SELECT IVS, '${collection}' AS collection, code FROM "ivs_${collection}"`)
            .join(` UNION ALL `))
}

async function createSvs(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "svs_cjkci"`)
    db.exec(`CREATE TABLE "svs_cjkci" (
        "SVS" TEXT PRIMARY KEY,
        "CJKCI" TEXT NOT NULL
    )`)
    const insert = db.prepare(
        `INSERT INTO "svs_cjkci" ("SVS", "CJKCI")
        VALUES (?, ?)`)

    const mjipath = path.join(__dirname, "../resources/unicode/svs.csv")
    const stream = fs.createReadStream(mjipath).pipe(parse({
        columns: true
    }))

    await transaction(db, async () => {
        for await (const record of stream) {
            insert.run([
                parseVS(record["SVS"]),
                parseUCS(record["CJKCI"])
            ])
        }
    })

    db.exec(`CREATE INDEX "svs_cjkci_CJKCI" ON "svs_cjkci" ("CJKCI")`)
}

async function createCjkRadicals(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "radicals"`)
    db.exec(format(`CREATE TABLE "radicals" (
        "radical" TEXT GENERATED ALWAYS AS ("radical_number" || CASE WHEN "radical_simplified" THEN '''' ELSE '' END) VIRTUAL,
        "radical_number" INTEGER NOT NULL,
        "radical_simplified" INTEGER NOT NULL CHECK ("radical_simplified" IN (0, 1)),
        "radical_character" TEXT NOT NULL,
        "radical_CJKUI" TEXT NOT NULL,
        "部首" INTEGER GENERATED ALWAYS AS (CASE WHEN NOT "radical_simplified" THEN "radical_number" END) VIRTUAL,
        "部首漢字" TEXT GENERATED ALWAYS AS ("radical_CJKUI") VIRTUAL,
        PRIMARY KEY ("radical_number", "radical_simplified")
    )`))
    const insert = db.prepare(
        `INSERT INTO "radicals" ("radical_number", "radical_simplified", "radical_character", "radical_CJKUI")
        VALUES (?, ?, ?, ?)`)

    const csvpath = path.join(__dirname, "../cache/CJKRadicals.txt")
    const stream = fs.createReadStream(csvpath).pipe(parse({
        columns: false,
        skipEmptyLines: true,
        comment: "#",
        delimiter: "; ",
    }))

    await transaction(db, async () => {
        for await (const record of stream) {
            const radical = record[0]
            const radical_simplified = Number(radical.substr(-1) === "'")
            const radical_number = parseInt(radical, 10)
            const radical_character = String.fromCodePoint(parseInt(record[1], 16))
            const radical_cjkui = String.fromCodePoint(parseInt(record[2], 16))
            insert.run([
                radical_number,
                radical_simplified,
                radical_character,
                radical_cjkui,
            ])
        }
    })
}

async function createRadicalEquivalents(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "radeqv"`)
    db.exec(format(`CREATE TABLE "radeqv" (
        "radical_character" TEXT PRIMARY KEY,
        "radical_CJKUI" TEXT
    )`))
    const insert = db.prepare(
        `INSERT INTO "radeqv" ("radical_character", "radical_CJKUI")
        VALUES (?, ?)`)

    const csvpath = path.join(__dirname, "../cache/EquivalentUnifiedIdeograph.txt")
    const content = fs.readFileSync(csvpath)
    const lines = content.toString().split("\n")
    const list: [number, number | null][] = lines
        .map(line => line.replace(/#.*/, ""))
        .filter(line => !/^\s*$/.test(line))
        .flatMap(line => {
            let [codes, equiv] = line.split(";", 2)
            let [code1, code2] = codes.split("..", 2)
            equiv = equiv?.trim()
            code1 = code1?.trim()
            code2 = code2?.trim()
            if (equiv && code1) {
                if (!code2) {
                    return [[parseInt(code1, 16), parseInt(equiv, 16)]]
                } else {
                    return [
                        [parseInt(code1, 16), parseInt(equiv, 16)],
                        [parseInt(code2, 16), parseInt(equiv, 16)]
                    ]
                }
            } else {
                throw new Error("format error")
            }
        })
    const noEquivList: [number, number | null][] = lines
        .flatMap(line => {
            const m = /^# ([\dA-F]{4,5}); CJK [\w ]+$/.exec(line)
            if (!m) return []
            return [[parseInt(m[1], 16), null]]
        })

    await transaction(db, async () => {
        for await (const record of [...list, ...noEquivList]) {
            const radical_character_code = record[0]
            const radical_cjkui_code = record[1]
            insert.run([
                String.fromCodePoint(radical_character_code),
                radical_cjkui_code && String.fromCodePoint(radical_cjkui_code),
            ])
        }
    })
}

async function createUSource(db: import("better-sqlite3").Database, prefix = "usource", filename = "USourceData.txt") {
    db.exec(`drop table if exists "${prefix}"`)
    db.exec(`drop table if exists "${prefix}_source"`)
    db.exec(`drop table if exists "${prefix}_comment"`)
    db.exec(format(`CREATE TABLE "${prefix}" (
        "U-source ID" TEXT PRIMARY KEY,
        "status" TEXT NOT NULL,
        "UCS" TEXT,
        "RS" TEXT NOT NULL,
        "VKXDP" TEXT NOT NULL,
        "IDS" TEXT,
        "comments" TEXT NOT NULL,
        "TS" INTEGER,
        "FRS" INTEGER
    )`))
    db.exec(format(`CREATE TABLE "${prefix}_source" (
        "U-source ID" TEXT NOT NULL,
        "source" TEXT NOT NULL
    )`))
    const insert = db.prepare(
        `INSERT INTO "${prefix}" ("U-source ID", "status", "UCS", "RS", "VKXDP", "IDS", "comments", "TS", "FRS")
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insert_source = db.prepare(
        `INSERT INTO "${prefix}_source" ("U-source ID", "source")
            VALUES (?, ?)`)

    const csvpath = path.join(__dirname, "../cache", filename)
    const stream = fs.createReadStream(csvpath).pipe(parse({
        columns: false,
        skipEmptyLines: true,
        comment: "#",
        delimiter: "\t",
    }))

    await transaction(db, async () => {
        for await (const [line] of stream) {
            // ids and comments may include semicolon.
            const [id, status, codepoint, rs, vkxdp, ids, sources, comments,
                totalStrokes, firstResidualStroke]
                = (line as string)
                    // treat entity references in IDS
                    .replace(/&([^;]+);/g, "<<$1>>")
                    .split(/;/g)
            const ucs = codepoint
                ? String.fromCodePoint(parseInt(codepoint.substr(2), 16))
                : null
            try {
                insert.run([
                    id,
                    status,
                    ucs,
                    rs,
                    vkxdp,
                    ids ? ids.replace(/<<([^>]+)>>/g, "&$1;") : null,
                    comments,
                    totalStrokes || null,
                    firstResidualStroke || null,
                ])
                for (const source of sources.split(/\*/g)) {
                    if (source) {
                        insert_source.run([id, source])
                    }
                }
            } catch (err) {
                console.log(id)
                throw err
            }
        }
    })
}

async function createUnihan(db: import("better-sqlite3").Database, prefix = "unihan", resourceName = prefix) {
    db.exec(`drop view if exists "${prefix}"`)
    db.exec(`drop view if exists "${prefix}_variant"`)
    db.exec(`drop view if exists "${prefix}_strange"`)
    for (const table of db.prepare(
        `select tbl_name
        from sqlite_master
        where type = 'table' and tbl_name glob '${prefix}_k*'`
    ).pluck().all() as string[]) {
        db.exec(`drop table if exists "${table.replace(/"/g, '""')}"`)
    }

    const createTable = (property: string) => {
        db.exec(format(`CREATE TABLE "${prefix}_${property}" (
            "id" INTEGER PRIMARY KEY,
            "UCS" TEXT GENERATED ALWAYS AS (char(id)) VIRTUAL,
            "value" TEXT NOT NULL
        )`))
    }

    const unihanFileNames = fs.readdirSync(path.join(__dirname, "../resources", resourceName))

    const insertMap: Map<string, import("better-sqlite3").Statement<[string, string]>> = new Map()

    const getInsert = (property: string) => {
        const insert = insertMap.get(property)
        if (insert) return insert
        createTable(property)
        const newInsert = db.prepare(
            `INSERT INTO "${prefix}_${property}" (id, value)
            VALUES (?, ?)`)
        insertMap.set(property, newInsert)
        return newInsert
    }

    await transaction(db, async () => {
        for (const filename of unihanFileNames) {
            const csvpath = path.join(__dirname, "../resources", resourceName, filename)
            const stream = fs.createReadStream(csvpath).pipe(parse({
                columns: false,
                skipEmptyLines: true,
                comment: "#",
                delimiter: "\t",
            }))
            for await (const [codepoint, property, value] of stream) {
                const id = parseInt(codepoint.substr(2), 16)
                const insert = getInsert(property)
                insert.run([
                    id,
                    value
                ])
            }
        }
    })

    const properties = Array.from(insertMap.keys())
    db.exec(format(
        `CREATE VIEW "${prefix}" AS
        SELECT "id", "UCS", "property", "value"
        FROM (\n${properties
            .map(k => `SELECT '${k}' AS "property", "id", "UCS", "value" FROM "${prefix}_${k}"`)
            .join(`\nUNION ALL\n`)
        }\n)`))
    db.exec(format(`
        CREATE VIEW "${prefix}_variant" AS
        WITH u AS (
            SELECT k.id, l, UCS,
                CASE WHEN instr(e.value, '<') THEN substr(e.value, 1, instr(e.value, '<') - 1) ELSE e.value END AS v,
                CASE WHEN instr(e.value, '<') THEN substr(e.value, instr(e.value, '<') + 1) END AS note
            FROM (
                SELECT id, UCS, 'kCompatibilityVariant' AS l, value FROM ${prefix}_kCompatibilityVariant
                UNION ALL
                SELECT id, UCS, 'kSemanticVariant' AS l, value FROM ${prefix}_kSemanticVariant
                UNION ALL
                SELECT id, UCS, 'kSimplifiedVariant' AS l, value FROM ${prefix}_kSimplifiedVariant
                UNION ALL
                SELECT id, UCS, 'kSpecializedSemanticVariant' AS l, value FROM ${prefix}_kSpecializedSemanticVariant
                UNION ALL
                SELECT id, UCS, 'kSpoofingVariant' AS l, value FROM ${prefix}_kSpoofingVariant
                UNION ALL
                SELECT id, UCS, 'kTraditionalVariant' AS l, value FROM ${prefix}_kTraditionalVariant
                UNION ALL
                SELECT id, UCS, 'kZVariant' AS l, value FROM ${prefix}_kZVariant
                UNION ALL
                SELECT id, UCS, 'kJoyoKanji' AS l, value FROM ${prefix}_kJoyoKanji WHERE value GLOB 'U+*'
                UNION ALL
                SELECT id, UCS, 'kJinmeiyoKanji' AS l, substr(value, 6) FROM ${prefix}_kJinmeiyoKanji WHERE value GLOB '20??:U+*'
            ) AS k
            JOIN json_each('["' || replace(k.value, ' ', '","') || '"]') AS e
        ), t AS (
            SELECT id, l, UCS, note, substr('00' || substr(v, 3), -6) AS v
            FROM u
        ), s AS (
            SELECT id, l, UCS, note,
            (
                SELECT char(sum((unicode(json_extract('"\\u01' || e.value || '"', '$')) & 0xFF) << (8 * (2 - e.key))))
                FROM json_each(json_array(substr(v, 1, 2), substr(v, 3, 2), substr(v, 5, 2))) AS e
            ) AS v
            FROM t
        )
        SELECT id, UCS, l AS property, v AS value, note AS additional_data FROM s
    `))
    db.exec(format(`
        CREATE VIEW "${prefix}_strange" AS
        WITH u AS (
            SELECT t.id, t.UCS, substr(j.value, 1, 1) AS category, k.value AS v
            FROM ${prefix}_kStrange AS t
            JOIN json_each('["' || replace(t.value, ' ', '","') || '"]') AS j
            LEFT JOIN json_each('["' || replace(substr(j.value, 3), ':', '","') || '"]') AS k ON k.value <> ''
        ), t AS (
            SELECT id, UCS, category,
                CASE WHEN v GLOB 'U+*' THEN substr('00' || substr(v, 3), -6) END AS v,
                v AS n
            FROM u
        ), s AS (
            SELECT id, UCS, category,
            CASE WHEN v IS NOT NULL THEN (
                SELECT char(sum((unicode(json_extract('"\\u01' || e.value || '"', '$')) & 0xFF) << (8 * (2 - e.key))))
                FROM json_each(json_array(substr(v, 1, 2), substr(v, 3, 2), substr(v, 5, 2))) AS e
            ) END AS v,
            n
            FROM t
        )
        SELECT id, UCS, category, ifnull(v, n) AS value FROM s
    `))
    const sources = properties.flatMap(p => {
        const m = p.match(/^kIRG_(\w+?)Source$/)
        if (m) {
            return [m[1]];
        }
        return [];
    })
    db.exec(format(`
        CREATE VIEW "${prefix}_source" AS
        ${sources.map(s => `SELECT id, UCS, '${s}' as source, value FROM unihan_kIRG_${s}Source`).join("\nUNION ALL\n")}
    `));
}

async function createAj1(db: import("better-sqlite3").Database) {
    // See https://moji-memo.hatenablog.jp/entry/20090713/1247476330
    const cmaps = [
        "UniJIS",
        "UniJIS2004",
        "UniJISX0213",
        "UniJISX02132004"
    ]

    for (const cmap of cmaps) {
        db.exec(`create temporary table "aj1_${cmap}" (
            "CID" INTEGER NOT NULL,
            "UCS" TEXT NOT NULL,
            "vertical" INTEGER NOT NULL
        )`)
    }

    db.exec(`drop table if exists "aj1"`)
    db.exec(format(`CREATE TABLE "aj1" (
        "CID" INTEGER NOT NULL,
        "UCS" TEXT NOT NULL,
        "vertical" INTEGER NOT NULL,
        "UniJIS" INTEGER NOT NULL,
        "UniJIS2004" INTEGER NOT NULL,
        "UniJISX0213" INTEGER NOT NULL,
        "UniJISX02132004" INTEGER NOT NULL
    )`))

    const insert = Object.fromEntries(cmaps.map(cmap => [
        cmap,
        db.prepare(
            `INSERT INTO "aj1_${cmap}" ("CID", "UCS", "vertical")
            VALUES (?, ?, ?)`)
    ]))

    const datapath = path.join(__dirname, "../cache/cid2code.txt")
    const stream = fs.createReadStream(datapath).pipe(parse({
        columns: true,
        comment: "#",
        delimiter: "\t",
        skip_empty_lines: true,
    }))

    await transaction(db, async () => {
        for await (const record of stream) {
            const cid = record["CID"]
            for (const cmap of cmaps) {
                const utf32s = record[`${cmap}-UTF32`]
                if (utf32s !== '*') for (const utf32 of utf32s.split(/,/g)) {
                    const vertical = Number(utf32.slice(-1) === "v")
                    insert[cmap].run([
                        cid,
                        String.fromCodePoint(parseInt(vertical ? utf32.slice(0, -1) : utf32, 16)),
                        vertical
                    ])
                }
            }
        }
    })

    db.exec(`insert into aj1 (CID, UCS, vertical, UniJIS, UniJIS2004, UniJISX0213, UniJISX02132004)
        select CID, UCS, vertical, sum(UniJIS), sum(UniJIS2004), sum(UniJISX0213), sum(UniJISX02132004)
        from (
            select CID, UCS, vertical, 1 as UniJIS, 0 as UniJIS2004, 0 as UniJISX0213, 0 as UniJISX02132004 from aj1_UniJIS
            UNION ALL
            select CID, UCS, vertical, 0, 1, 0, 0 from aj1_UniJIS2004
            UNION ALL
            select CID, UCS, vertical, 0, 0, 1, 0 from aj1_UniJISX0213
            UNION ALL
            select CID, UCS, vertical, 0, 0, 0, 1 from aj1_UniJISX02132004
        )
        group by CID, UCS, vertical
    `)

    db.exec(`CREATE INDEX "aj1_CID" ON "aj1" ("CID")`)
    db.exec(`CREATE INDEX "aj1_UCS" ON "aj1" ("UCS")`)

    for (const hv of ["H", "V"]) {
        for (const cmap of cmaps) {
            db.exec(format(
                `CREATE VIEW "aj1_${cmap}_${hv}" AS
                SELECT "CID", "UCS"
                FROM "aj1"
                WHERE "${cmap}" AND ${hv === "V" ? '"vertical"' : 'NOT "vertical"'}
            `))
        }
    }
}

async function createIDS(db: import("better-sqlite3").Database, prefix = "ids", filename="IDS.TXT") {
    db.exec(`drop table if exists "${prefix}_fts"`)
    db.exec(`drop table if exists "${prefix}"`)
    db.exec(`drop table if exists "${prefix}_comment"`)

    db.exec(format(`CREATE TABLE "${prefix}" (
        "UCS" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "IDS" TEXT NOT NULL
    )`))
    db.exec(format(`CREATE TABLE "${prefix}_comment" (
        "UCS" TEXT NOT NULL,
        "comment" TEXT NOT NULL
    )`))

    const insert = db.prepare(`INSERT INTO "${prefix}"
        ("UCS", "source", "IDS") VALUES (?, ?, ?)`)

    const insert_comment = db.prepare(`INSERT INTO "${prefix}_comment"
        ("UCS", "comment") VALUES (?, ?)`)

    const datapath = path.join(__dirname, "../cache", filename)
    const stream = fs.createReadStream(datapath).pipe(parse({
        columns: false,
        comment: "#",
        delimiter: "\t",
        skip_empty_lines: true,
        relax_column_count: true,
    }))

    await transaction(db, async () => {
        for await (const record of stream) {
            const [codepoint, ucs, ...idslist] = record as string[]
            for (const field of idslist) {
                try {
                    if (field.startsWith("^")) {
                        const m = /\^([^\$]+)\$\(([^\)]+)\)/.exec(field)
                        if (!m) throw new Error("syntax error")
                        const ids = m[1]
                        const source = m[2] ?? ""
                        insert.run([ucs, source, ids])
                    } else if (field.startsWith("*")) {
                        const comments = field.slice(1).split(/;/g)
                        for (const comment of comments) {
                            insert_comment.run([ucs, comment.trim()])
                        }
                    } else {
                        if (ucs === "\u{276ad}") {
                            const comments = field.split(/;/g)
                            for (const comment of comments) {
                                insert_comment.run([ucs, comment.trim()])
                            }
                            continue
                        }
                        throw new Error("syntax error")
                    }
                } catch (err) {
                    console.error(codepoint)
                    throw err
                }
            }
        }
    })

    db.exec(`CREATE INDEX "${prefix}_UCS" ON "${prefix}" ("UCS")`)
    db.exec(`CREATE INDEX "${prefix}_comment_UCS" ON "${prefix}_comment" ("UCS")`)
}

async function createJoyoKanjiHyo(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "joyo"`)
    db.exec(`drop table if exists "joyo_kangxi"`)
    db.exec(`CREATE TABLE joyo (漢字 TEXT, 音訓 TEXT, 例 TEXT, 備考 TEXT, PRIMARY KEY (漢字, 音訓))`)
    db.exec(`CREATE TABLE joyo_acceptable (漢字 TEXT PRIMARY KEY)`)
    db.exec(`CREATE TABLE joyo_kangxi (漢字 TEXT, 康熙字典体 TEXT, PRIMARY KEY (漢字, 康熙字典体))`)
    const insert = db.prepare(`insert into joyo (漢字, 音訓, 例, 備考) values (:subject, :reading, :examples, :note)`)
    const insert_acceptable = db.prepare(`insert or ignore into joyo_acceptable (漢字) values (:acceptable)`)
    const insert_kangxi = db.prepare(`insert or ignore into joyo_kangxi (漢字, 康熙字典体) values (:subject, :kangxi)`)
    await transaction(db, async () => {
        for (const record of joyoKanjiHyo) {
            insert.run({
                subject: record.subject,
                reading: record.reading,
                examples: JSON.stringify(record.examples),
                note: record.note,
            })
            if (record.acceptable) {
                insert_acceptable.run({
                    acceptable: record.acceptable
                })
            }
            if (record.kangxi) {
                for (const kangxi of record.kangxi) {
                    insert_kangxi.run({
                        subject: record.subject,
                        kangxi: kangxi,
                    })
                }
            }
        }
    })
    db.exec(`CREATE INDEX "joyo_漢字" ON "joyo" ("漢字")`)
    db.exec(`CREATE INDEX "joyo_音訓" ON "joyo" ("音訓")`)
    db.exec(`CREATE INDEX "joyo_kangxi_漢字" ON "joyo_kangxi" ("漢字")`)
    db.exec(`CREATE INDEX "joyo_kangxi_康熙字典体" ON "joyo_kangxi" ("康熙字典体")`)
}

async function createNyukan(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "nyukan_itaiji"`)
    db.exec(`drop table if exists "nyukan_ruiji"`)
    db.exec(`CREATE TABLE nyukan_itaiji (簡体字等の文字コード等 TEXT, 簡体字等のUCS TEXT, 正字の文字コード等 TEXT, 正字のUCS TEXT, 順位 INTEGER, PRIMARY KEY (簡体字等の文字コード等, 順位))`)
    db.exec(`CREATE TABLE nyukan_ruiji (簡体字等の文字コード等 TEXT, 簡体字等のUCS TEXT, 正字の文字コード等 TEXT, 正字のUCS TEXT, 順位 INTEGER, PRIMARY KEY (簡体字等の文字コード等, 順位))`)
    const insert_itaiji = db.prepare(`insert into nyukan_itaiji (簡体字等の文字コード等, 簡体字等のUCS, 正字の文字コード等, 正字のUCS, 順位) values (:code1, :char1, :code2, :char2, :ord)`)
    const insert_ruiji = db.prepare(`insert into nyukan_ruiji (簡体字等の文字コード等, 簡体字等のUCS, 正字の文字コード等, 正字のUCS, 順位) values (:code1, :char1, :code2, :char2, :ord)`)
    const codeToChar = (code: string) => {
        const p = Number.parseInt(code, 16)
        if (0xE000 <= p && p <= 0xF8FF) {
            return null
        }
        return String.fromCodePoint(p)
    }
    await transaction(db, async () => {
        for (const record of nyukanseiji.table4_1) {
            const [code1, code2, code3] = record
            insert_itaiji.run({
                code1,
                char1: codeToChar(code1),
                code2,
                char2: codeToChar(code2),
                ord: 1,
            })
            if (code3) {
                insert_itaiji.run({
                    code1,
                    char1: codeToChar(code1),
                    code2: code3,
                    char2: codeToChar(code3),
                    ord: 2,
                })
            }
        }
        for (const record of nyukanseiji.table4_2) {
            const [code1, code2, code3] = record
            insert_ruiji.run({
                code1,
                char1: codeToChar(code1),
                code2,
                char2: codeToChar(code2),
                ord: 1,
            })
            if (code3) {
                insert_ruiji.run({
                    code1,
                    char1: codeToChar(code1),
                    code2: code3,
                    char2: codeToChar(code3),
                    ord: 2,
                })
            }
        }
    })
    db.exec(`CREATE INDEX "nyukan_itaiji_簡体字等のUCS" ON "nyukan_itaiji" ("簡体字等のUCS")`)
    db.exec(`CREATE INDEX "nyukan_itaiji_正字のUCS" ON "nyukan_itaiji" ("正字のUCS")`)
    db.exec(`CREATE INDEX "nyukan_ruiji_簡体字等のUCS" ON "nyukan_ruiji" ("簡体字等のUCS")`)
    db.exec(`CREATE INDEX "nyukan_ruiji_正字のUCS" ON "nyukan_ruiji" ("正字のUCS")`)
    db.exec(format(
        `CREATE VIEW "nyukan" AS
        SELECT '異体字' AS 正字の種類, 簡体字等の文字コード等, 簡体字等のUCS, 正字の文字コード等, 正字のUCS, 順位
        FROM nyukan_itaiji
        UNION ALL
        SELECT '類字' AS 正字の種類, 簡体字等の文字コード等, 簡体字等のUCS, 正字の文字コード等, 正字のUCS, 順位
        FROM nyukan_ruiji
    `))
}

async function createDoon(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "doon"`)
    db.exec(`CREATE TABLE doon (書きかえる漢字 TEXT NOT NULL, 書きかえた漢字 TEXT NOT NULL, 書きかえる漢語 TEXT NOT NULL, 書きかえた漢語 TEXT NOT NULL, 採用した文書 TEXT NOT NULL)`)
    const insert = db.prepare(`insert into doon (書きかえる漢字, 書きかえた漢字, 書きかえる漢語, 書きかえた漢語, 採用した文書) values (:char_from, :char_to, :word_from, :word_to, :bibliography)`)
    const csvpath = path.join(__dirname, "../cache/doonnokanjiniyorukakikae1956.txt")
    const stream = fs.createReadStream(csvpath).pipe(parse({
        columns: false,
        skipEmptyLines: true,
        delimiter: "\t",
        from: 2,
    }))
    await transaction(db, async () => {
        for await (const [char_from, char_to, word_from, word_to, bibliography] of stream) {
            insert.run({
                char_from,
                char_to,
                word_from,
                word_to,
                bibliography,
            })
        }
    })
    db.exec(`CREATE INDEX "doon_書きかえる漢字" ON "doon" ("書きかえる漢字")`)
    db.exec(`CREATE INDEX "doon_書きかえた漢字" ON "doon" ("書きかえた漢字")`)
}

async function createKdpv(db: import("better-sqlite3").Database) {
    db.exec(`drop view if exists "kdpv"`)
    const dropTables = db.prepare(`select name from sqlite_master where type = 'table' and name glob 'kdpv_*'`).pluck().all()
    for (const t of dropTables) {
        db.exec(`drop table "${t.replace(/"/g, '""')}"`)
    }
    const filenames = (await promisify(fs.readdir)(path.join(__dirname, "../cache"), "utf-8")).filter(f => f.startsWith("cjkvi-variants_") && f.endsWith(".txt"))
    const rels = new Map<string, Statement>()
    const relrevs = new Map<string, string>()
    const relnames = new Map<string | undefined, string>()
    const getInsertToRel = (rel: string) => {
        const i = rels.get(rel)
        if (i) return i
        const tname = `"kdpv_${rel.replace(/"/g, '""')}"`
        db.exec(`CREATE TABLE ${tname} (subject TEXT NOT NULL, object TEXT NOT NULL, comment TEXT)`)
        const st = db.prepare(`INSERT INTO ${tname} (subject, object, comment) VALUES (?, ?, ?)`)
        rels.set(rel, st)
        return st
    }
    await transaction(db, async () => {
        for (const filename of filenames) {
            try {
                const csvpath = path.join(__dirname, "../cache", filename)
                if (filename === "cjkvi-variants_jp-old-style.txt") {
                    const stream = fs.createReadStream(csvpath).pipe(parse({
                        columns: false,
                        skipEmptyLines: true,
                        relax_column_count: true,
                        delimiter: "\t",
                    }))
                    relrevs.set("jp/old-style", "jp/new-style")
                    relnames.set("jp/old-style", "旧字体")
                    relnames.set("jp/new-style", "新字体")
                    relrevs.set("jp/old-style/compat", "jp/new-style")
                    relnames.set("jp/old-style/compat", "旧字体（互換漢字）")
                    for await (let [subj, obj, compat, comment] of stream) {
                        if (subj) subj = subj.trim()
                        if (obj) obj = obj.trim()
                        if (compat) compat = compat.trim()
                        if (comment) comment = comment.trim()
                        if (subj && subj.startsWith("#")) {
                            continue
                        }
                        const c = comment ? comment.replace(/^#\s*/, "") : null
                        if (obj) {
                            const insert = getInsertToRel("jp/old-style")
                            insert.run(subj, obj, c)
                        }
                        if (compat) {
                            const insert = getInsertToRel("jp/old-style/compat")
                            insert.run(subj, compat, c)
                        }
                    }
                    continue
                }
                const stream = fs.createReadStream(csvpath).pipe(parse({
                    columns: false,
                    skipEmptyLines: true,
                    relax_column_count: true,
                    comment: "#",
                    delimiter: ",",
                }))
                for await (let [subj, rel, obj, comment] of stream) {
                    if (subj) subj = subj.trim()
                    if (rel) rel = rel.trim()
                    if (obj) obj = obj.trim()
                    if (comment) comment = comment.trim()
                    if (rel === '<name>') {
                        relnames.set(subj, obj)
                    } else if (rel === '<rev>') {
                        relrevs.set(subj, obj)
                        relrevs.set(obj, subj)
                    } else if (rel.startsWith('<')) {
                        // ignore unknown meta relations
                    } else {
                        const insert = getInsertToRel(rel)
                        insert.run(subj, obj, comment)
                    }
                }
            } catch (err) {
                console.error(filename)
                throw err
            }
        }
    })
    db.exec(`CREATE TABLE "kdpv_rels" (rel TEXT NOT NULL PRIMARY KEY, name TEXT, rev TEXT, rev_name TEXT)`)
    const insert_rel = db.prepare(`INSERT INTO kdpv_rels (rel, name, rev, rev_name) VALUES (?, ?, ?, ?)`)
    for (const rel of rels.keys()) {
        insert_rel.run(rel, relnames.get(rel), relrevs.get(rel), relnames.get(relrevs.get(rel)))
        const tname = `"kdpv_${rel.replace(/"/g, '""')}"`
        db.exec(`CREATE INDEX "kdpv_${rel.replace(/"/g, '""')}_subject" ON ${tname} (subject)`)
        db.exec(`CREATE INDEX "kdpv_${rel.replace(/"/g, '""')}_object" ON ${tname} (object)`)
    }
    db.exec(format(`CREATE VIEW "kdpv" AS\n${Array.from(rels.keys()).map(rel => {
        const tname = `"kdpv_${rel.replace(/"/g, '""')}"`
        return `SELECT subject, '${rel.replace(/'/g, "''")}' AS rel, object, comment FROM ${tname}`
    }).join(`\nUNION ALL\n`)}`))
}

async function createTghb(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "tghb"`)
    db.exec(`CREATE TABLE tghb (序号 TEXT NOT NULL PRIMARY KEY, 规范字 TEXT NOT NULL, 级 INTEGER NOT NULL, 笔画 INTEGER NOT NULL, 註解 TEXT)`)
    const insert = db.prepare(`insert into tghb (序号, 规范字, 级, 笔画, 註解) values (:num, :char, :class, :strokes, :note)`)
    const csvpath = path.join(__dirname, "../cache/tghb.txt")
    const stream = fs.createReadStream(csvpath).pipe(parse({
        columns: false,
        skipEmptyLines: true,
        delimiter: "\t",
        from: 2,
    }))
    await transaction(db, async () => {
        for await (const [num, char, klass, strokes, note] of stream) {
            insert.run({
                num,
                char,
                class: Number.parseInt(klass),
                strokes: Number.parseInt(strokes),
                note: note || null,
            })
        }
    })
    db.exec(`CREATE INDEX "tghb_规范字" ON "tghb" ("规范字")`)
    db.exec(`CREATE INDEX "tghb_笔画" ON "tghb" ("笔画")`)
}

async function createTghbVariants(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "tghb_variants"`)
    db.exec(`CREATE TABLE tghb_variants (序号 TEXT NOT NULL, 规范字 TEXT NOT NULL, 繁体字 TEXT NOT NULL, 异体字 TEXT NOT NULL, 註解 TEXT)`)
    const insert = db.prepare(`insert into tghb_variants (序号, 规范字, 繁体字, 异体字, 註解) values (:num, :char, :hant, :variant, :note)`)
    const csvpath = path.join(__dirname, "../cache/tghb_variants.txt")
    const stream = fs.createReadStream(csvpath).pipe(parse({
        columns: false,
        skipEmptyLines: true,
        delimiter: "\t",
        from: 2,
    }))
    await transaction(db, async () => {
        for await (const [num, char, hant, variant, note] of stream) {
            insert.run({
                num,
                char,
                hant,
                variant,
                note: note || null,
            })
        }
    })
    db.exec(`CREATE INDEX "tghb_variants_序号" ON "tghb_variants" ("序号")`)
    db.exec(`CREATE INDEX "tghb_variants_规范字" ON "tghb_variants" ("规范字")`)
    db.exec(`CREATE INDEX "tghb_variants_繁体字" ON "tghb_variants" ("繁体字")`)
    db.exec(`CREATE INDEX "tghb_variants_异体字" ON "tghb_variants" ("异体字")`)
}


async function vacuum(db: import("better-sqlite3").Database) {
    db.exec("PRAGMA journal_mode = DELETE")
    db.exec("VACUUM")
}

function time<X extends any[], Y>(func: (...args: X) => Promise<Y>): (...args: X) => Promise<Y> {
    const name = func.name
    return async (...args) => {
        const label = String([name, ...args.slice(1)])
        console.time(label)
        try {
            return await func(...args)
        } finally {
            console.timeEnd(label)
        }
    }
}

async function main() {
    await promisify(fs.mkdir)(path.join(__dirname, "../dist"), { recursive: true })
    await promisify(fs.rm)(dbpath, { force: true })
    const db = new Database(dbpath)
    console.time("ALL")
    db.exec("PRAGMA journal_mode = WAL")
    await time(createMji)(db)
    await time(createMjsm)(db)
    await time(createIvs)(db)
    await time(createSvs)(db)
    await time(createCjkRadicals)(db)
    await time(createRadicalEquivalents)(db)
    await time(createUSource)(db)
    await time(createUSource)(db, "usource_draft", "USourceData-draft.txt")
    await time(createUnihan)(db)
    await time(createUnihan)(db, "unihan_draft")
    await time(createAj1)(db)
    await time(createIDS)(db)
    await time(createIDS)(db, "ids_draft", "IDS_15.TXT")
    await time(createJoyoKanjiHyo)(db)
    await time(createNyukan)(db)
    await time(createDoon)(db)
    await time(createKdpv)(db)
    await time(createTghb)(db)
    await time(createTghbVariants)(db)
    await time(vacuum)(db)
    console.timeEnd("ALL")
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
