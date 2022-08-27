#!/usr/bin/env node
import Database = require("better-sqlite3")
const mojidb = require.resolve("@mandel59/mojidata/dist/moji.db")

const db = new Database(mojidb)

const argv = process.argv.slice(2)
if (argv.length === 0) {
    help()
    process.exit(1)
}

printMojidata(argv)

function help() {
    console.log("usage: mojidata-variants CHAR")
}

function printMojidata(argv: string[]) {
    const args = argv.map(s => {
        if (s.startsWith('U+')) {
            return String.fromCodePoint(Number.parseInt(s.substr(2), 16))
        }
        return s
    }).filter(s => {
        if (s[0] <= '\u00ff') {
            // ignore unknown arguments
            // TODO: handle invalid arguments properly
            return false
        }
        return true
    }).flatMap(s => {
        return Array.from(s)
    })
    const records = db.prepare(`
        WITH RECURSIVE
            args (value) AS (SELECT j.value FROM json_each(@args) AS j),
            rels (c1, c2, r) AS (
                SELECT UCS AS c1, value AS c2, property AS r
                FROM unihan_draft_variant as unihan_variant
                UNION ALL
                SELECT UCS AS c1, value AS c2, 'kStrange_' || category AS r
                FROM unihan_draft_strange as unihan_strange
                WHERE category IN ('F', 'M', 'O', 'R', 'I') AND value IS NOT NULL
                UNION ALL
                SELECT ifnull(mji.実装したUCS, mji.対応するUCS) AS c1, mjsm.縮退UCS AS c2, mjsm.表 AS r
                FROM mjsm
                JOIN mji ON mjsm.MJ文字図形名 = mji.MJ文字図形名
                WHERE ifnull(mjsm.ホップ数, 1) < 2 AND mjsm.表 NOT GLOB '法務省告示582号*'
                UNION ALL
                SELECT 簡体字等のUCS AS c1, 正字のUCS AS c2, '入管正字_' || 正字の種類 || '_第' || 順位 || '順位' AS r
                FROM nyukan
                WHERE 簡体字等のUCS IS NOT NULL
                UNION ALL
                SELECT DISTINCT 書きかえる漢字 AS c1, 書きかえた漢字 AS c2, '同音の漢字による書きかえ' AS r
                FROM doon
                UNION ALL
                SELECT 康熙字典体 AS c1, 漢字 AS c2, '常用漢字表_新字体' AS r
                FROM joyo_kangxi
                UNION ALL
                SELECT subject AS c1, object AS c2, rel AS r
                FROM kdpv
                WHERE rel IN (
                    'cjkvi/duplicate',
                    'cjkvi/non-cognate',
                    'jisx0212/variant',
                    'jisx0213/variant')
                    AND length(subject) = 1
                    AND length(object) = 1
                UNION ALL
                SELECT 异体字 AS c1, 繁体字 AS c2, 'tghb_异体字' AS r
                FROM tghb_variants
                WHERE 异体字 glob '?'
                UNION ALL
                SELECT 繁体字 AS c1, 规范字 AS c2, 'tghb_规范字' AS r
                FROM tghb_variants
                /* END OF UNION ALL */
                ORDER BY c1, c2, r
            ),
            t (c1, c2, rs, f) AS (
                SELECT c1, c2, json_group_array(r) AS rs,
                    max(
                        r NOT IN (
                            'kSpoofingVariant',
                            'kSpecializedSemanticVariant',
                            '民一2842号通達別表_誤字俗字正字一覧表_別字',
                            '入管正字_類字_第1順位',
                            '入管正字_類字_第2順位',
                            '同音の漢字による書きかえ',
                            'cjkvi/non-cognate')
                        AND r NOT GLOB 'kStrange_?'
                    ) AS f
                FROM rels GROUP BY c1, c2
            ),
            u (c1, c2, rs, f) AS (
                SELECT DISTINCT c1, c2, rs, f
                FROM t
                WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
                UNION
                SELECT DISTINCT t.c1, t.c2, t.rs, t.f
                FROM u JOIN t ON u.c1 = t.c1 OR u.c1 = t.c2 OR u.c2 = t.c1 OR u.c2 = t.c2
                WHERE u.f
            )
        SELECT c1, c2, f, j.value AS r FROM u JOIN json_each(u.rs) AS j
        `).all({ args: JSON.stringify(args) })
    const chars = new Map<string, any[]>()
    let edgeId = 0
    const edges = new Set<string>()
    const addEdge = (n1: string, n2: string, style: string) => {
        if (n1 > n2) {
            [n1, n2] = [n2, n1];
        }
        const edgeUniq = `${n1}|${n2}|${style}`
        if (!edges.has(edgeUniq)) {
            console.log(`    %% edge ${edgeId}`)
            console.log(`    ${n1} --- ${n2}`)
            if (style) {
                console.log(`    linkStyle ${edgeId} ${style}`)
            }
            edgeId++
            edges.add(edgeUniq)
        }
    }
    const codepoint = (c: string) => `U+${c.codePointAt(0)?.toString(16).toUpperCase()}`
    const nodeId = (c: string) => `u${c.codePointAt(0)?.toString(16)}`
    const addChar = (c: string, f: boolean) => {
        if (!chars.has(c)) {
            console.log(`    ${nodeId(c)}(("${c}<br/><small><a href=#35;${nodeId(c)}>${codepoint(c)}</a></small>"))`)
            if (!f) {
                console.log(`    style ${nodeId(c)} stroke-dasharray: 5 5`)
            }
            chars.set(c, [])
        }
    }
    // output Markdown with mermaid graph
    console.log("```mermaid")
    console.log("flowchart LR")
    const style = (r: string) => {
        if (r === "kSpoofingVariant"
            || r === "kSpecializedSemanticVariant"
            || r === "民一2842号通達別表_誤字俗字正字一覧表_別字"
            || r === "入管正字_類字_第1順位"
            || r === "入管正字_類字_第2順位"
            || r === "同音の漢字による書きかえ"
            || r === "cjkvi/non-cognate"
            || r.startsWith("kStrange_")) {
            return "stroke-dasharray: 5 5"
        }
        return ""
    }
    /** character-following map */
    const cfm = new Map<string, boolean>()
    for (const c of args) {
        cfm.set(c, true)
    }
    for (const record of records) {
        const c1: string = record.c1
        const c2: string = record.c2
        const f: boolean = Boolean(record.f)
        cfm.set(c1, (cfm.get(c1) ?? false) || f)
        cfm.set(c2, (cfm.get(c2) ?? false) || f)
    }
    for (const [c, f] of cfm.entries()) {
        addChar(c, f)
    }
    for (const record of records) {
        const c1: string = record.c1
        const c2: string = record.c2
        const r: string = record.r
        if (c1 !== c2) {
            addEdge(nodeId(c1), nodeId(c2), style(r))
        }
        chars.get(c1)?.push(record)
        chars.get(c2)?.push(record)
    }
    console.log("```")
    for (const [c0, charRecords] of chars) {
        console.log(`## <a id="${nodeId(c0)}" href="#${nodeId(c0)}">U+${c0.codePointAt(0)?.toString(16).toUpperCase()}</a> ${c0}`)
        const chars = new Map<string, any[]>()
        let edgeId = 0
        const edges = new Set<string>()
        const addEdge = (n1: string, n2: string, style: string, label: string) => {
            const edgeUniq = `${n1}|${n2}|${style}|${label}`
            if (!edges.has(edgeUniq)) {
                console.log(`    %% edge ${edgeId}`)
                console.log(`    ${n1} -- "${label}" --> ${n2}`)
                if (style) {
                    console.log(`    linkStyle ${edgeId} ${style}`)
                }
                edgeId++
                edges.add(edgeUniq)
            }
        }
        const addChar = (c: string) => {
            if (!chars.has(c)) {
                if (c === c0) {
                    console.log(`    ${nodeId(c)}((("${c}<br/><small>${codepoint(c)}</small>")))`)
                } else {
                    console.log(`    ${nodeId(c)}(("${c}<br/><small><a href=#35;${nodeId(c)}>${codepoint(c)}</a></small>"))`)
                }
                if (!cfm.get(c)) {
                    console.log(`    style ${nodeId(c)} stroke-dasharray: 5 5`)
                }
                chars.set(c, [])
            }
        }
        console.log("```mermaid")
        console.log("flowchart LR")
        addChar(c0)
        for (const record of charRecords) {
            const c1: string = record.c1
            const c2: string = record.c2
            const r: string = record.r
            addChar(c1)
            addChar(c2)
            addEdge(nodeId(c1), nodeId(c2), style(r), r)
            chars.get(c1)?.push(record)
            chars.get(c2)?.push(record)
        }
        console.log("```")
    }
}
