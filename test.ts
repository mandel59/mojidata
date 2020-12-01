import test from 'ava'
import path from 'path'
import Database from 'better-sqlite3'

test('lookup SVS', t => {
    const db = new Database(path.join(__dirname, 'dist', 'moji.db'))
    const svs = db.prepare(`select SVS from svs_cjkci where CJKCI = ?`)
        .pluck()
        .all('\uFA19')
    t.deepEqual(svs, ['\u795E\uFE00'])
})
