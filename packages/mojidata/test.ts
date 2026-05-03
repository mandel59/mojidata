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

test('unihan_value_ref matches legacy unihan_fts scan semantics', t => {
    const db = new Database(path.join(__dirname, 'dist', 'moji.db'))
    const legacy = db.prepare(`
        SELECT printf('U+%04X', unicode(UCS)) AS code, UCS, property, value
        FROM unihan
        WHERE unicode(:ref) > 0xFF AND (
            value glob printf('*%s*', :ref)
            OR (value glob printf('*U+%04X*', unicode(:ref))
                AND NOT value glob printf('*U+%04X[0-9A-F]*', unicode(:ref)))
        )
        AND property NOT IN ('kJapanese', 'kSMSZD2003Readings', 'kFanqie')
        ORDER BY UCS
        LIMIT 100
    `)
    const indexed = db.prepare(`
        SELECT printf('U+%04X', unicode(UCS)) AS code, UCS, property, value
        FROM unihan_value_ref
        WHERE unicode(:ref) > 0xFF AND ref = :ref
        ORDER BY UCS
        LIMIT 100
    `)

    for (const ref of ['漢', '龜', '𠮷']) {
        t.deepEqual(indexed.all({ ref }), legacy.all({ ref }))
    }
})
