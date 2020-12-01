import fs from "fs"
import path from "path"
import { promisify } from "util"
import parse from "csv-parse"
import Database from "better-sqlite3"
import sqlFormatter from "sql-formatter"

const format = sqlFormatter.format

function parseUCS(code: string) {
    return String.fromCodePoint(parseInt(code.slice(2), 16))
}

function parseVS(code: string) {
    return String.fromCodePoint(...code.split('_').map(code => parseInt(code, 16)))
}

async function transaction(db: import("better-sqlite3").Database, callback: () => Promise<void>) {
    db.exec("begin")
    try {
        await callback()
        db.exec("commit")
    } catch (err) {
        db.exec("rollback")
        throw err
    }
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
        "更新履歴" TEXT,
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
        "更新履歴",
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
            for (let i = 0; i < 4; i++) {
                if (row[radicalKey[i]] && row[strokeKey[i]]) {
                    insert_rsindex.run([row["MJ文字図形名"], row[radicalKey[i]], row[strokeKey[i]]])
                }
            }
        }
    })

    db.exec(`CREATE INDEX "mji_対応するUCS" ON "mji" ("対応するUCS")`)
    db.exec(`CREATE INDEX "mji_reading_MJ文字図形名" ON "mji_reading" ("MJ文字図形名")`)
    db.exec(`CREATE INDEX "mji_reading_読み" ON "mji_reading" ("読み")`)
    db.exec(`CREATE INDEX "mji_rsindex_MJ文字図形名" ON "mji_rsindex" ("MJ文字図形名")`)
    db.exec(`CREATE INDEX "mji_rsindex_部首_内画数" ON "mji_rsindex" ("部首", "内画数")`)
}

async function createMjsm(db: import("better-sqlite3").Database) {
    const tables = [
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
    const ruleKeys = ["JIS包摂基準・UCS統合規則", "法務省戸籍法関連通達・通知", "法務省告示582号別表第四", "辞書類等による関連字", "読み・字形による類推"]
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
}

async function createIvs(db: import("better-sqlite3").Database) {
    db.exec(`drop table if exists "ivs"`)
    db.exec(`create temporary table "ivs" (
        "IVS" TEXT NOT NULL,
        "collection" TEXT NOT NULL,
        "code" TEXT NOT NULL
    )`)
    const insert = db.prepare(
        `INSERT INTO "ivs" ("IVS", "collection", "code")
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

    const collections = db.prepare("select distinct collection from ivs").pluck().all()

    for (const collection of collections) {
        if (collection === "Adobe-Japan1") {
            db.exec(format(`CREATE TABLE "ivs_${collection}" (
                "IVS" TEXT PRIMARY KEY,
                "CID" INTEGER NOT NULL
            )`))
            db.exec(`insert into "ivs_${collection}" (IVS, CID)
                select IVS, cast(substr(code, 5) as integer) from ivs where collection = 'Adobe-Japan1'`)
            db.exec(`CREATE INDEX "ivs_${collection}_CID" ON "ivs_${collection}" ("CID")`)
        } else {
            db.exec(format(`CREATE TABLE "ivs_${collection}" (
                "IVS" TEXT PRIMARY KEY,
                "code" TEXT NOT NULL
            )`))
            db.exec(`insert into "ivs_${collection}" ("IVS", "code")
                select IVS, code from ivs where collection = '${collection}'`)
            db.exec(`CREATE INDEX "ivs_${collection}_code" ON "ivs" ("code")`)
        }
    }
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

async function vacuum(db: import("better-sqlite3").Database) {
    db.exec("VACUUM")
}

async function main() {
    await promisify(fs.mkdir)(path.join(__dirname, "../dist"), { recursive: true })
    const dbpath = path.join(__dirname, "../dist/moji.db")
    const db = new Database(dbpath)
    await createMji(db)
    await createMjsm(db)
    await createIvs(db)
    await createSvs(db)
    await createAj1(db)
    await vacuum(db)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
