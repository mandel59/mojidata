#!/usr/bin/env node
import { createSqlJsDb } from "@mandel59/mojidata-api-sqljs"

const db = createSqlJsDb()

function help() {
    console.log("usage: mojidata-variants CHAR")
}

async function printMojidata(argv: string[]) {
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
    const records = await db.getMojidataVariantRels(args)
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

async function main() {
    const argv = process.argv.slice(2)
    if (argv.length === 0) {
        help()
        process.exit(1)
    }
    await printMojidata(argv)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
