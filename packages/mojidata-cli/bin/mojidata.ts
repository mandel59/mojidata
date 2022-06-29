#!/usr/bin/env node
import Database = require("better-sqlite3")
const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

const db = new Database(mojidb)

const argv = process.argv.slice(2)
if (argv.length === 0) {
    help()
    process.exit(1)
}

for (const arg of argv) {
    printMojidata(arg)
}

function help() {
    console.log("usage: mojidata CHAR")
}

function printMojidata(s: string) {
    if (s.startsWith('U+')) {
        s = String.fromCodePoint(Number.parseInt(s.substr(2), 16))
    }
    if (s[0] <= '\u00ff') {
        // ignore unknown arguments
        // TODO: handle invalid arguments properly
        return
    }
    for (const c of s) {
        const values = db.prepare(`
        SELECT json_object(
            'char', @ucs,
            'UCS', printf('U+%04X', unicode(@ucs)),
            'aj1', (SELECT json_object('CID', CID) FROM aj1 WHERE aj1.UCS = @ucs),
            'ids', (SELECT json_group_array(json_object('IDS', ids.IDS, 'source', ids.source)) FROM ids WHERE ids.UCS = @ucs),
            'ids_comment', (SELECT json_group_array(ids_comment.comment) FROM ids_comment WHERE ids_comment.UCS = @ucs),
            'ivs', (SELECT json_group_array(json_object(
                'char', ivs.IVS,
                'IVS', printf('%04X_%04X', unicode(ivs.IVS), unicode(substr(ivs.IVS, 2))),
                'collection', ivs.collection,
                'code', ivs.code)) FROM ivs WHERE ivs.IVS glob (@ucs || '*')),
            'svs_cjkci', (SELECT json_group_array(json_object('char', SVS, 'SVS', printf('%04X_%04X', unicode(SVS), unicode(substr(SVS, 2))), 'CJKCI', printf('U+%04X', unicode(CJKCI)))) FROM svs_cjkci WHERE SVS glob @ucs || '*'),
            'unihan', (SELECT json_group_object(unihan.property, unihan.value) FROM unihan WHERE unihan.UCS = @ucs),
            'joyo', (SELECT json_group_array(json_object('音訓', 音訓, '例', json(例), '備考', 備考)) FROM joyo WHERE joyo.漢字 = @ucs),
            'joyo_kangxi', (SELECT json_group_array(康熙字典体) FROM joyo_kangxi WHERE joyo_kangxi.漢字 = @ucs),
            'doon', (SELECT json_group_array(json_object('書き換える漢語', 書き換える漢語, '書き換えた漢語', 書き換えた漢語, '採用した文書', 採用した文書)) FROM doon WHERE 書き換える漢字	= @ucs OR 書き換えた漢字 = @ucs),
            'mji', (
                SELECT json_group_array(json_object(
                    'MJ文字図形名', MJ文字図形名,
                    '対応するUCS', CASE WHEN 対応するUCS IS NOT NULL THEN printf('U+%04X', unicode(対応するUCS)) END,
                    '実装したUCS', CASE WHEN 実装したUCS IS NOT NULL THEN printf('U+%04X', unicode(実装したUCS)) END,
                    '実装したMoji_JohoコレクションIVS', CASE WHEN 実装したMoji_JohoコレクションIVS IS NOT NULL THEN printf('%04X_%04X', unicode(実装したMoji_JohoコレクションIVS), unicode(substr(実装したMoji_JohoコレクションIVS, 2))) END,
                    '実装したSVS', CASE WHEN 実装したSVS IS NOT NULL THEN printf('%04X_%04X', unicode(実装したSVS), unicode(substr(実装したSVS, 2))) END,
                    '戸籍統一文字番号', 戸籍統一文字番号,
                    '住基ネット統一文字コード', 住基ネット統一文字コード,
                    '入管正字コード', 入管正字コード,
                    '入管外字コード', 入管外字コード,
                    '漢字施策', 漢字施策,
                    '対応する互換漢字', 対応する互換漢字,
                    'X0213', X0213,
                    'X0213_包摂連番', X0213_包摂連番,
                    'X0213_包摂区分', X0213_包摂区分,
                    'X0212', X0212,
                    'MJ文字図形バージョン', MJ文字図形バージョン,
                    '登記統一文字番号', 登記統一文字番号,
                    '部首・内画数', (SELECT json_group_array(json_array(部首, 内画数)) FROM mji_rsindex WHERE mji_rsindex.MJ文字図形名 = mji.MJ文字図形名),
                    '総画数', 総画数,
                    '読み', (SELECT json_group_array(読み) FROM mji_reading WHERE mji_reading.MJ文字図形名 = mji.MJ文字図形名),
                    '大漢和', 大漢和,
                    '日本語漢字辞典', 日本語漢字辞典,
                    '新大字典', 新大字典,
                    '大字源', 大字源,
                    '大漢語林', 大漢語林,
                    '更新履歴', (SELECT json_group_array(更新履歴) FROM mji_changelog WHERE mji_changelog.MJ文字図形名 = mji.MJ文字図形名),
                    '備考', 備考)) FROM mji WHERE mji.対応するUCS = @ucs OR mji.実装したUCS = @ucs)
        ) AS vs`).pluck().all({ ucs: c })
        for (const value of values) {
            console.log(value)
        }
    }
}
