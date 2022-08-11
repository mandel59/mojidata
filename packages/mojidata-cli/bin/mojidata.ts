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
            'ids', (SELECT json_group_array(json_object('IDS', ids.IDS, 'source', ids.source)) FROM ids_draft as ids WHERE ids.UCS = @ucs),
            'ids_comment', (SELECT json_group_array(ids_comment.comment) FROM ids_draft_comment as ids_comment WHERE ids_comment.UCS = @ucs),
            'ivs', (SELECT json_group_array(json_object(
                'char', ivs.IVS,
                'IVS', printf('%04X_%04X', unicode(ivs.IVS), unicode(substr(ivs.IVS, 2))),
                'collection', ivs.collection,
                'code', ivs.code)) FROM ivs WHERE ivs.IVS glob (@ucs || '*')),
            'svs_cjkci', (
                SELECT json_group_array(json_object(
                    'SVS_char', SVS,
                    'SVS', printf('%04X_%04X', unicode(SVS), unicode(substr(SVS, 2))),
                    'CJKCI_char', CJKCI,
                    'CJKCI', printf('U+%04X', unicode(CJKCI))))
                FROM svs_cjkci
                WHERE (SVS glob @ucs || '*') OR (CJKCI glob @ucs || '*')),
            'unihan', (SELECT json_group_object(property, value) FROM unihan_draft as unihan WHERE unihan.id = unicode(@ucs)),
            'unihan_variant', (SELECT json_group_array(CASE WHEN additional_data IS NOT NULL THEN json_array(property, printf('U+%04X', unicode(value)), value, additional_data) ELSE json_array(property, printf('U+%04X', unicode(value)), value) END) FROM unihan_draft_variant as unihan_variant WHERE unihan_variant.id = unicode(@ucs)),
            'joyo', (SELECT json_group_array(json_object('音訓', 音訓, '例', json(例), '備考', 備考)) FROM joyo WHERE joyo.漢字 = @ucs),
            'joyo_kangxi', (SELECT json_group_array(康熙字典体) FROM joyo_kangxi WHERE joyo_kangxi.漢字 = @ucs),
            'doon', (SELECT json_group_array(json_object('書きかえる漢語', 書きかえる漢語, '書きかえた漢語', 書きかえた漢語, '採用した文書', 採用した文書)) FROM doon WHERE 書きかえる漢字	= @ucs OR 書きかえた漢字 = @ucs),
            'nyukan', (
                SELECT json_group_array(json_object(
                    '正字の種類', 正字の種類,
                    '簡体字等の文字コード等', 簡体字等の文字コード等,
                    '簡体字等のUCS', 簡体字等のUCS,
                    '正字の文字コード等', 正字の文字コード等,
                    '正字のUCS', 正字のUCS,
                    '順位', 順位))
                FROM nyukan
                WHERE 簡体字等のUCS = @ucs OR 正字のUCS = @ucs
            ),
            'tghb', (
                SELECT json_group_array(json_object(
                    '序号', tghb.序号,
                    '规范字', tghb.规范字,
                    '级', tghb.级,
                    '笔画', tghb.笔画,
                    '註解', tghb.註解,
                    '异体字', (SELECT json_group_array(json_object(
                        '繁体字', v.繁体字,
                        '异体字', v.异体字,
                        '註解', v.註解
                    )) FROM tghb_variants AS v WHERE v.规范字 = tghb.规范字)
                ))
                FROM tghb
                WHERE @ucs = tghb.规范字 OR @ucs IN (SELECT v.异体字 FROM tghb_variants AS v WHERE v.规范字 = tghb.规范字)
            ),
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
                    '対応する互換漢字', CASE WHEN 対応する互換漢字 IS NOT NULL THEN printf('U+%04X', unicode(対応する互換漢字)) END,
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
                    '備考', 備考,
                    'mjsm', (
                        SELECT json_group_array(json_array(
                            mjsm.表,
                            printf('U+%04X', unicode(mjsm.縮退UCS)),
                            mjsm.縮退UCS))
                        FROM mjsm
                        WHERE mji.MJ文字図形名 = mjsm.MJ文字図形名
                        ORDER BY mjsm.表, mjsm.順位, mjsm.ホップ数
                    )))
                    FROM mji
                    WHERE mji.対応するUCS = @ucs OR mji.実装したUCS = @ucs),
            'kdpv', (
                SELECT json_group_object(rel, cs) FROM (
                    SELECT rel, json_group_array(c) AS cs FROM (
                        SELECT DISTINCT rel, object AS c FROM kdpv WHERE subject glob @ucs || '*'
                        UNION
                        SELECT DISTINCT ifnull(rev, '~' || kdpv.rel) AS rel, subject AS c FROM kdpv LEFT JOIN kdpv_rels ON kdpv_rels.rel = kdpv.rel WHERE object glob @ucs || '*'
                    )
                    GROUP BY rel
                )
            )
        ) AS vs`).pluck().all({ ucs: c })
        for (const value of values) {
            console.log(value)
        }
    }
}
