export const queryExpressions = [
  ['char', `@ucs`],
  ['UCS', `printf('U+%04X', unicode(@ucs))`],
  ['aj1', `CASE WHEN (@ucs IN (SELECT UCS FROM aj1)) THEN json_object(
    'CID', (SELECT CID FROM aj1 WHERE UCS = @ucs ORDER BY vertical ASC, UniJIS2004 DESC, CID ASC LIMIT 1),
    'jp90', (SELECT CID FROM aj1_UniJIS_H WHERE UCS = @ucs),
    'jp90_V', (SELECT CID FROM aj1_UniJIS_V WHERE UCS = @ucs),
    'jp04', (SELECT CID FROM aj1_UniJIS2004_H WHERE UCS = @ucs),
    'jp04_V', (SELECT CID FROM aj1_UniJIS2004_V WHERE UCS = @ucs),
    'mac_jp90', (SELECT CID FROM aj1_UniJISX0213_H WHERE UCS = @ucs),
    'mac_jp90_V', (SELECT CID FROM aj1_UniJISX0213_V WHERE UCS = @ucs),
    'mac_jp04', (SELECT CID FROM aj1_UniJISX02132004_H WHERE UCS = @ucs),
    'mac_jp04_V', (SELECT CID FROM aj1_UniJISX02132004_V WHERE UCS = @ucs)
  ) END`],
  [
    'ids',
    `(SELECT json_group_array(json_object('IDS', ids.IDS, 'source', ids.source)) FROM ids WHERE ids.UCS = @ucs)`,
  ],
  [
    'ids_similar',
    `(SELECT json_group_array(json_object('UCS', ids.UCS, 'IDS', ids.IDS, 'source', ids.source)) FROM ids WHERE ids.IDS glob ('[〾↔↷]' || @ucs))`,
  ],
  [
    'ids_comment',
    `(SELECT json_group_array(ids_comment.comment) FROM ids_comment WHERE ids_comment.UCS = @ucs)`,
  ],
  [
    'ivs',
    `(SELECT json_group_array(json_object(
        'char', ivs.IVS,
        'IVS', printf('%04X_%04X', unicode(ivs.IVS), unicode(substr(ivs.IVS, 2))),
        'collection', ivs.collection,
        'code', ivs.code)) FROM ivs WHERE ivs.IVS glob (@ucs || '*'))`,
  ],
  [
    'svs_cjkci',
    `(
        SELECT json_group_array(json_object(
            'SVS_char', SVS,
            'SVS', printf('%04X_%04X', unicode(SVS), unicode(substr(SVS, 2))),
            'CJKCI_char', CJKCI,
            'CJKCI', printf('U+%04X', unicode(CJKCI))))
        FROM svs_cjkci
        WHERE (SVS glob @ucs || '*') OR (CJKCI glob @ucs || '*'))`,
  ],
  [
    'unihan',
    `(SELECT json_group_object(property, value) FROM unihan WHERE unihan.UCS = @ucs)`,
  ],
  [
    'unihan_fts',
    `(SELECT json_group_array(json_array(printf('U+%04X', unicode(UCS)), UCS, property, value)) FROM
      (SELECT * FROM unihan
        WHERE unicode(@ucs) > 0xFF AND (
          unihan.value glob printf('*%s*', @ucs)
          OR (unihan.value glob printf('*U+%04X*', unicode(@ucs))
            AND NOT unihan.value glob printf('*U+%04X[0-9A-F]*', unicode(@ucs))))
        ORDER BY UCS
        LIMIT 100))`,
  ],
  [
    'unihan_variant',
    `(SELECT json_group_array(CASE WHEN additional_data IS NOT NULL THEN json_array(property, printf('U+%04X', unicode(value)), value, additional_data) ELSE json_array(property, printf('U+%04X', unicode(value)), value) END) FROM unihan_variant WHERE unihan_variant.UCS = @ucs)`,
  ],
  [
    'unihan_variant_inverse',
    `(SELECT json_group_array(CASE WHEN additional_data IS NOT NULL THEN json_array(property, printf('U+%04X', unicode(UCS)), UCS, additional_data) ELSE json_array(property, printf('U+%04X', unicode(UCS)), UCS) END) FROM unihan_variant WHERE unihan_variant.value = @ucs)`,
  ],
  [
    'joyo',
    `(SELECT json_group_array(json_object('音訓', 音訓, '例', json(例), '備考', 備考)) FROM joyo WHERE joyo.漢字 = @ucs)`,
  ],
  [
    'joyo_kangxi',
    `(SELECT json_group_array(康熙字典体) FROM joyo_kangxi WHERE joyo_kangxi.漢字 = @ucs)`,
  ],
  [
    'joyo_kangxi_inverse',
    `(SELECT json_group_array(漢字) FROM joyo_kangxi WHERE joyo_kangxi.康熙字典体 = @ucs)`,
  ],
  [
    'doon',
    `(SELECT json_group_array(json_object('書きかえる漢語', 書きかえる漢語, '書きかえた漢語', 書きかえた漢語, '採用した文書', 採用した文書)) FROM doon WHERE 書きかえる漢字	= @ucs OR 書きかえた漢字 = @ucs)`,
  ],
  [
    'nyukan',
    `(
        SELECT json_group_array(json_object(
            '正字の種類', 正字の種類,
            '簡体字等の文字コード等', 簡体字等の文字コード等,
            '簡体字等のUCS', 簡体字等のUCS,
            '正字の文字コード等', 正字の文字コード等,
            '正字のUCS', 正字のUCS,
            '順位', 順位))
        FROM nyukan
        WHERE 簡体字等のUCS = @ucs OR 正字のUCS = @ucs
    )`,
  ],
  [
    'tghb',
    `(
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
    )`,
  ],
  [
    'mji',
    `(
        SELECT json_group_array(json_object(
            '文字', coalesce(実装したSVS, 実装したUCS, 実装したMoji_JohoコレクションIVS),
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
        WHERE mji.対応するUCS = @ucs OR mji.実装したUCS = @ucs)`,
  ],
  [
    'mjsm_inverse',
    `(
        SELECT json_group_array(json_object(
            '表', mjsm.表,
            '文字', coalesce(実装したSVS, 実装したUCS, 実装したMoji_JohoコレクションIVS),
            'MJ文字図形名', mji.MJ文字図形名,
            '対応するUCS', CASE WHEN 対応するUCS IS NOT NULL THEN printf('U+%04X', unicode(対応するUCS)) END,
            '実装したUCS', CASE WHEN 実装したUCS IS NOT NULL THEN printf('U+%04X', unicode(実装したUCS)) END,
            '実装したMoji_JohoコレクションIVS', CASE WHEN 実装したMoji_JohoコレクションIVS IS NOT NULL THEN printf('%04X_%04X', unicode(実装したMoji_JohoコレクションIVS), unicode(substr(実装したMoji_JohoコレクションIVS, 2))) END,
            '実装したSVS', CASE WHEN 実装したSVS IS NOT NULL THEN printf('%04X_%04X', unicode(実装したSVS), unicode(substr(実装したSVS, 2))) END))
        FROM mji join mjsm on mji.MJ文字図形名 = mjsm.MJ文字図形名
        WHERE mjsm.縮退UCS = @ucs)`,
  ],
  [
    'mjih',
    `(SELECT json_group_array(json_object(
      'MJ文字図形名', MJ文字図形名,
      '文字', 文字,
      'CharacterName', CharacterName,
      'UCS符号位置', UCS符号位置,
      '字母', 字母,
      '字母のUCS符号位置', 字母のUCS符号位置,
      '音価', (SELECT json_group_array(音価) FROM mjih_phonetic AS p WHERE p.MJ文字図形名 = mjih.MJ文字図形名),
      '戸籍統一文字番号', 戸籍統一文字番号,
      '学術用変体仮名番号', 学術用変体仮名番号,
      '国語研URL', 国語研URL,
      '備考', 備考
    ))
    FROM mjih WHERE @ucs = mjih.文字 OR @ucs = mjih.字母 OR @ucs IN (SELECT 音価 FROM mjih_phonetic AS p WHERE p.MJ文字図形名 = mjih.MJ文字図形名))`,
  ],
  [
    'kdpv',
    `(
        SELECT json_group_object(rel, json(cs)) FROM (
            SELECT rel, json_group_array(c) AS cs FROM (
                SELECT DISTINCT rel, object AS c FROM kdpv WHERE subject glob @ucs || '*'
                UNION
                SELECT DISTINCT ifnull(rev, '~' || kdpv.rel) AS rel, subject AS c FROM kdpv LEFT JOIN kdpv_rels ON kdpv_rels.rel = kdpv.rel WHERE object glob @ucs || '*'
            )
            GROUP BY rel
        )
    )`,
  ],
]
