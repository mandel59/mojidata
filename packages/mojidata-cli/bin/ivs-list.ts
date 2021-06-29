import Database = require("better-sqlite3")
const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

const db = new Database(mojidb)

const argv = process.argv.slice(2)
if (argv.length === 0) {
    help()
    process.exit(1)
}

for (const arg of argv) {
    for (const c of arg.match(/\p{sc=Han}/gu) ?? []) {
        printIvsList(c)
    }
}

function help() {
    console.log("usage: ivs-list CHAR")
}

function printIvsList(c: string) {
    const ivsList = db.prepare(`
    SELECT IVS, printf('%04X %04X', unicode(IVS), unicode(substr(IVS, 2))) AS unicode, collection, code
    FROM ivs
    WHERE IVS GLOB ? || '*'`).all(c)
    for (const ivs of ivsList) {
        console.log(JSON.stringify(ivs))
    }
}
