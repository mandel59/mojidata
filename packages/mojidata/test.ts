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

test('applies the Unicode 18 IDS delta', t => {
    const db = new Database(path.join(__dirname, 'dist', 'moji.db'))
    const ids = db.prepare(`
        SELECT source, IDS FROM ids WHERE UCS = ? ORDER BY source
    `)

    t.deepEqual(ids.all('\u{2B81E}'), [
        { source: 'G', IDS: '⿰日欠' },
    ])
    t.deepEqual(ids.all('\u{2EA07}'), [
        { source: 'JS', IDS: '⿰⿸厂㇯{18}一頁' },
        { source: 'TP', IDS: '⿰⿸厂巳頁' },
    ])
    t.deepEqual(ids.all('\u{312E7}'), [
        { source: 'G', IDS: '⿰麦差' },
    ])
})

test('includes final Unicode 18 U-Source and Unihan corrections', t => {
    const db = new Database(path.join(__dirname, 'dist', 'moji.db'))
    try {
        t.deepEqual(db.prepare(`
            SELECT UCS, IDS FROM usource WHERE U_source_ID = ?
        `).get('UK-01469'), { UCS: '\u{300BB}', IDS: '⿰亻𬂉' })
        t.is(db.prepare(`
            SELECT value FROM unihan WHERE UCS = ? AND property = 'kJinmeiyoKanji'
        `).pluck().get('勒'), '2026')
    } finally {
        db.close()
    }
})

test('exposes Japanese new and old forms in unihan_variant', t => {
    const db = new Database(path.join(__dirname, 'dist', 'moji.db'), { readonly: true })
    try {
        const forward = db.prepare(`
            SELECT value, additional_data FROM unihan_variant
            WHERE UCS = ? AND property = ? ORDER BY value
        `)
        t.deepEqual(forward.all('國', 'kJapaneseNewVariant'), [
            { value: '国', additional_data: null },
        ])
        t.deepEqual(forward.all('国', 'kJapaneseOldVariant'), [
            { value: '國', additional_data: null },
        ])
        t.deepEqual(forward.all('弁', 'kJapaneseOldVariant'), [
            { value: '瓣', additional_data: null },
            { value: '辨', additional_data: null },
            { value: '辯', additional_data: null },
        ])
        t.deepEqual(db.prepare(`
            SELECT UCS FROM unihan_variant
            WHERE value = ? AND property = ? ORDER BY UCS
        `).pluck().all('弁', 'kJapaneseNewVariant'), ['瓣', '辨', '辯'])

        for (const property of ['kJapaneseNewVariant', 'kJapaneseOldVariant']) {
            const expected = (db.prepare(`
                SELECT UCS, value FROM unihan WHERE property = ? ORDER BY UCS
            `).all(property) as { UCS: string, value: string }[]).flatMap(row =>
                row.value.split(' ').map(value => ({
                    UCS: row.UCS,
                    value: String.fromCodePoint(Number.parseInt(value.slice(2), 16)),
                    additional_data: null,
                })))
            t.true(expected.length > 0)
            t.deepEqual(db.prepare(`
                SELECT UCS, value, additional_data FROM unihan_variant
                WHERE property = ? ORDER BY UCS, value
            `).all(property), expected)
        }
    } finally {
        db.close()
    }
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
        ORDER BY UCS, property, value
        LIMIT 100
    `)
    const indexed = db.prepare(`
        SELECT printf('U+%04X', unicode(UCS)) AS code, UCS, property, value
        FROM unihan_value_ref
        WHERE unicode(:ref) > 0xFF AND ref = :ref
        ORDER BY UCS, property, value
        LIMIT 100
    `)

    for (const ref of ['漢', '龜', '𠮷']) {
        t.deepEqual(indexed.all({ ref }), legacy.all({ ref }))
    }
})
