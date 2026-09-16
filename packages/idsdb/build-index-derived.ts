import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { buildIdsfindBvec } from "./lib/idsfind-bvec-db"

/** The caller must validate the base input stamp for the requested semantics. */
export function deriveIdsfindIndex(baseDir: string, outputDir: string, mode: "fts5" | "bvec") {
    baseDir = path.resolve(baseDir)
    outputDir = path.resolve(outputDir)
    if (baseDir === outputDir) throw new Error("Derived output must differ from the base directory")
    fs.mkdirSync(outputDir, { recursive: true })
    const temporary = path.join(outputDir, `idsfind.db.tmp-${process.pid}`)
    const decomposition = path.join(outputDir, `idsdecompose.db.tmp-${process.pid}`)
    try {
        fs.copyFileSync(path.join(baseDir, "idsfind.db"), temporary)
        fs.copyFileSync(path.join(baseDir, "idsdecompose.db"), decomposition)
        const db = new Database(temporary)
        try {
            const meta = db.prepare("SELECT index_mode FROM idsfind_build_meta WHERE schema_version = 1").get() as { index_mode: string } | undefined
            if (meta?.index_mode !== "fts4") throw new Error("Expected a verified FTS4 base database")
            const schema = db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'idsfind_fts'").pluck().get() as string
            // Preserve the exact token characters collected from the input IDS,
            // including symbols absent from final expanded rows.
            const tokenchars = /tokenize=unicode61 "tokenchars=([^"]*)"/.exec(schema)?.[1]
            if (tokenchars === undefined) throw new Error("Unsupported base tokenizer schema")
            db.exec("DROP TABLE idsfind_fts")
            if (mode === "fts5") {
                const escaped = tokenchars.replace(/'/g, "''")
                db.exec(`CREATE VIRTUAL TABLE idsfind_fts USING fts5(
                    content='', tokenize = "unicode61 tokenchars '${escaped}'", IDS_tokens
                )`)
                db.exec("CREATE INDEX idsfind_ref_char ON idsfind_ref(char)")
                db.exec(`INSERT INTO idsfind_fts(rowid, IDS_tokens)
                    SELECT (SELECT docid FROM idsfind_ref WHERE char = UCS),
                        '§ ' || group_concat(IDS_tokens, ' § ') || ' §'
                    FROM idsfind GROUP BY UCS`)
                db.exec("DROP INDEX idsfind_ref_char")
                db.exec("INSERT INTO idsfind_fts(idsfind_fts) VALUES ('optimize')")
            } else {
                db.exec("DROP TABLE idsfind_ref")
                buildIdsfindBvec(db)
            }
            db.prepare("UPDATE idsfind_build_meta SET index_mode = ? WHERE schema_version = 1").run(mode)
            db.exec("VACUUM")
        } finally { db.close() }
        fs.renameSync(temporary, path.join(outputDir, "idsfind.db"))
        fs.renameSync(decomposition, path.join(outputDir, "idsdecompose.db"))
    } finally {
        fs.rmSync(temporary, { force: true })
        fs.rmSync(decomposition, { force: true })
    }
}

if (require.main === module) {
    const [base, output, mode] = process.argv.slice(2)
    if (!base || !output || !["fts5", "bvec"].includes(mode)) {
        throw new Error("Usage: build-index-derived.ts <base directory> <output directory> <fts5|bvec>")
    }
    deriveIdsfindIndex(base, output, mode as "fts5" | "bvec")
    console.log(`Derived ${mode} index from verified FTS4 rows; reused IDS decomposition`)
}
