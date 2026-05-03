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

test('includes indexes for D1 full-field lookup predicates', t => {
    const db = new Database(path.join(__dirname, 'dist', 'moji.db'))
    const indexes = new Set(db.prepare(`
        SELECT name FROM sqlite_schema
        WHERE type = 'index'
          AND name IN ('ids_IDS', 'mjih_phonetic_MJ文字図形名')
    `).pluck().all())

    t.true(indexes.has('ids_IDS'))
    t.true(indexes.has('mjih_phonetic_MJ文字図形名'))
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
