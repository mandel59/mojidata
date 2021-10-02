import path from "path"
import Database from "better-sqlite3"
import yaml from "yaml"

const dbpath = path.join(__dirname, "../dist/moji.db")

async function main() {
    const db = new Database(dbpath)
    db.exec("PRAGMA journal_mode = WAL")
    const tables = db.prepare(
        `SELECT type, name
            FROM sqlite_master
            WHERE type IN ('table', 'view')
            ORDER BY name`
    ).all().map(({ type, name }) => {
        const columns = db.prepare(`PRAGMA table_xinfo("${name}")`).all().map(({
            name,
            type,
            hidden,
        }) => {
            const column: any = {}
            const generatedAlways = type.endsWith(" GENERATED ALWAYS")
            const stored = hidden == 3
            if (generatedAlways) {
                type = type.replace(" GENERATED ALWAYS", "")
            }
            if (type) column.type = { raw: type }
            if (generatedAlways) column.generatedAlways = {
                stored
            }
            column.title = name
            column.description = ""
            return [
                name,
                column
            ]
        })
        const columnOrder = columns.map(([name]) => name)
        return [
            name,
            {
                type,
                title: name,
                description: "",
                columnOrder,
                columns: Object.fromEntries(columns),
            }
        ]
    })
    console.log(yaml.stringify({ tables: Object.fromEntries(tables) }))
}

if (require.main === module) {
    main().catch(err => {
        console.error(err)
        process.exit(1)
    })
}
