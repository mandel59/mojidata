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
            t (c1, c2, r) AS (
                SELECT UCS AS c1, value AS c2, property AS r
                FROM unihan_variant
                UNION ALL
                SELECT ifnull(mji.実装したUCS, mji.対応するUCS) AS c1, mjsm.縮退UCS AS c2, mjsm.表 AS r
                FROM mjsm
                JOIN mji ON mjsm.MJ文字図形名 = mji.MJ文字図形名
                WHERE ifnull(ホップ数, 1) < 2
                UNION ALL
                SELECT DISTINCT 書きかえる漢字 AS c1, 書きかえた漢字 AS c2, '同音の漢字による書きかえ' AS r
                FROM doon
                ORDER BY c1, c2, r
            ),
            u (c1, c2, r) AS (
                SELECT DISTINCT c1, c2, r
                FROM t
                WHERE c1 IN (SELECT value FROM args) OR c2 IN (SELECT value FROM args)
                UNION
                SELECT DISTINCT t.c1, t.c2, t.r
                FROM u JOIN t ON u.c1 = t.c1 OR u.c1 = t.c2 OR u.c2 = t.c1 OR u.c2 = t.c2
                WHERE u.r NOT IN ('kSpoofingVariant', '民一2842号通達別表_誤字俗字正字一覧表_別字', '法務省告示582号別表第四_二', '同音の漢字による書きかえ')
            )
        SELECT c1, c2, r FROM u
        `).all({ args: JSON.stringify(args) })
    const chars = new Map<string, any[]>()
    let edgeId = 0
    const edges = new Set<string>()
    const addEdge = (n1: string, n2: string, style: string) => {
        const edgeUniq = `${n1}|${n2}|${style}`
        if (!edges.has(edgeUniq)) {
            console.log(`    %% edge ${edgeId}`)
            console.log(`    ${n1} --> ${n2}`)
            if (style) {
                console.log(`    linkStyle ${edgeId} ${style}`)
            }
            edgeId++
            edges.add(edgeUniq)
        }
    }
    const codepoint = (c: string) => `U+${c.codePointAt(0)?.toString(16).toUpperCase()}`
    const nodeId = (c: string) => `u${c.codePointAt(0)?.toString(16)}`
    const addChar = (c: string) => {
        if (!chars.has(c)) {
            if (args.includes(c)) {
                console.log(`    ${nodeId(c)}((("${c}<br/><small><a href=#35;${nodeId(c)}>${codepoint(c)}</a></small>")))`)
            } else {
                console.log(`    ${nodeId(c)}(("${c}<br/><small><a href=#35;${nodeId(c)}>${codepoint(c)}</a></small>"))`)
            }
            chars.set(c, [])
        }
    }
    // output Markdown with mermaid graph
    console.log("```mermaid")
    console.log("flowchart LR")
    const style = (r: string) => {
        if (r === "kSpoofingVariant"
            || r === "民一2842号通達別表_誤字俗字正字一覧表_別字"
            || r === "法務省告示582号別表第四_二"
            || r === "同音の漢字による書きかえ") {
            return "stroke-dasharray: 5 5"
        }
        return ""
    }
    for (const c of args) {
        addChar(c)
    }
    for (const record of records) {
        const c1: string = record.c1
        const c2: string = record.c2
        const r: string = record.r
        addChar(c1)
        addChar(c2)
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
