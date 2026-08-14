import fs from "node:fs"
import path from "node:path"

import { nodeLength, normalizeOverlaid, tokenArgs } from "./ids-operator"
import { parseBabelStoneIdsSourceExpression } from "./ids-source"
import { tokenizeIDS } from "./ids-tokenizer"

type SqlBindParams = unknown[] | Record<string, unknown> | null | undefined

type SqlStatement = {
    bind: (values?: SqlBindParams) => boolean
    step: () => boolean
    get: (params?: SqlBindParams) => unknown[]
    getAsObject: (params?: SqlBindParams) => Record<string, unknown>
    reset: () => void
    run: (values?: SqlBindParams) => void
    free: () => boolean
}

type SqlDatabase = {
    run: (sql: string, params?: SqlBindParams) => unknown
    prepare: (sql: string, params?: SqlBindParams) => SqlStatement
    export: () => Uint8Array
    close: () => void
}

type SqlJsStatic = {
    Database: new (data?: ArrayLike<number> | Uint8Array | null) => SqlDatabase
}

const initSqlJs = require("sql.js") as (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>

const encodeMap: Partial<Record<string, string>> = {
    "〾": "V",
    "⿰": "h2",
    "⿱": "v2",
    "⿲": "h3",
    "⿳": "v3",
    "⿴": "fs",
    "⿵": "sa",
    "⿶": "sb",
    "⿷": "sl",
    "⿸": "ul",
    "⿹": "ur",
    "⿺": "ll",
    "⿻": "O",
    "⿼": "sr",
    "⿽": "lr",
    "⿾": "F",
    "⿿": "R",
    "㇯": "S",
    "↔": "F",
    "↷": "R",
    "⊖": "S",
}

const idsOperatorRegExp = new RegExp(`^(?:${Object.keys(tokenArgs).join("|")})\$`)

const fallbackSourceOrder = ["G", "T", "H", "K", "J", "UK", "UTC", "*"]

function resolvePnpVirtualPath(filePath: string) {
    if (!path.isAbsolute(filePath)) return filePath
    try {
        const pnp = require("pnpapi") as {
            resolveVirtual?: (p: string) => string | null
        }
        return pnp.resolveVirtual?.(filePath) ?? filePath
    } catch {
        return filePath
    }
}

let sqlJsPromise: Promise<SqlJsStatic> | undefined
async function getSqlJsNode(): Promise<SqlJsStatic> {
    sqlJsPromise ??= (() => {
        const wasmPath = resolvePnpVirtualPath(
            require.resolve("sql.js/dist/sql-wasm.wasm"),
        )
        return initSqlJs({
            locateFile: () => wasmPath,
        })
    })()
    return sqlJsPromise
}

async function openDatabaseFromFile(filePath: string): Promise<SqlDatabase> {
    const SQL = await getSqlJsNode()
    const realPath = resolvePnpVirtualPath(filePath)
    const bytes = fs.readFileSync(realPath)
    return new SQL.Database(new Uint8Array(bytes))
}

function encodeTokensToXmlName(tokens: string[]) {
    return tokens.join("").replace(/./u, char => {
        return encodeMap[char] ?? char
    })
}

function* allCombinations<T>(list: Array<() => Iterable<T>>): Generator<T[]> {
    if (list.length === 0) {
        return
    }
    const [first, ...rest] = list
    if (rest.length === 0) {
        for (const item of first()) {
            yield [item]
        }
        return
    }
    for (const restItems of allCombinations(rest)) {
        for (const item of first()) {
            yield [item, ...restItems]
        }
    }
}

export type IDSDecompositionInput = {
    UCS: string
    source: string
    IDS: string
}

export type IDSDecomposerOptions = {
    mojidb?: string
    idstable?: string
    unihanPrefix?: string
    dbpath?: string
    expandZVariants?: boolean
    normalizeKdpvRadicalVariants?: boolean
    sourceFilter?: string
    includeMojidataIds?: boolean
    additionalIds?: Iterable<IDSDecompositionInput>
}

export type IDSDecompositionCycleStep = {
    char: string
    source: string
    expandedChar: string
    selectedSource: string
    idsTokens: string
    dependency: string
}

export class IDSDecompositionCycleError extends Error {
    readonly witness: IDSDecompositionCycleStep[]
    constructor(witness: IDSDecompositionCycleStep[]) {
        const states = witness.map(step => `${step.char}@${step.source}`)
        if (witness.length > 0) {
            const last = witness[witness.length - 1]
            states.push(`${last.dependency}@${last.source}`)
        }
        super(`Cyclic IDS decomposition: ${states.join(" -> ")}`)
        this.name = "IDSDecompositionCycleError"
        this.witness = witness
    }
}

type ResolvedIDS = {
    idsTokens: string
    selectedSource: string
}

export class IDSDecomposer {
    private db: SqlDatabase
    private lookupIDSStatement: SqlStatement
    private insertFallbackStatement: SqlStatement
    private savePath?: string
    readonly expandZVariants: boolean
    readonly normalizeKdpvRadicalVariants: boolean
    private zvar?: Map<string, string[]>
    private constructor(
        db: SqlDatabase,
        statements: { lookupIDS: SqlStatement, insertFallback: SqlStatement },
        options: IDSDecomposerOptions,
    ) {
        this.expandZVariants = options.expandZVariants ?? false
        this.normalizeKdpvRadicalVariants = options.normalizeKdpvRadicalVariants ?? false
        this.db = db
        this.lookupIDSStatement = statements.lookupIDS
        this.insertFallbackStatement = statements.insertFallback
        this.savePath = options.dbpath
        this.replaceSingleWildcardToCharItself()
        this.reduceAllSubtractions()
    }

    static async create(options: IDSDecomposerOptions = {}): Promise<IDSDecomposer> {
        const SQL = await getSqlJsNode()
        const idstable = options.idstable ?? "ids"
        const unihanPrefix = options.unihanPrefix ?? "unihan"
        const mojidbpath = (options.mojidb ?? require.resolve("@mandel59/mojidata/dist/moji.db"))

        const mojiDb = await openDatabaseFromFile(mojidbpath)
        try {
            const db = new SQL.Database()

            db.run(`drop table if exists tempids`)
            db.run(`create table tempids (UCS, source, IDS_tokens)`)
            db.run(`begin`)
            try {
                const insertTempids = db.prepare(
                    `insert into tempids (UCS, source, IDS_tokens) values (?, ?, ?)`,
                )
                const insertRow = (row: IDSDecompositionInput, sources: Iterable<string>) => {
                    const idsTokens = tokenizeIDS(row.IDS).join(" ")
                    for (const source of sources) {
                        if (options.sourceFilter && source !== options.sourceFilter) continue
                        insertTempids.run([row.UCS, source, idsTokens])
                    }
                }
                if (options.includeMojidataIds ?? true) {
                    const selectIds = mojiDb.prepare(
                        `select UCS, source, IDS from ${idstable}`,
                    )
                    while (selectIds.step()) {
                        const row = selectIds.getAsObject() as { UCS?: unknown, source?: unknown, IDS?: unknown }
                        if (typeof row.UCS !== "string") continue
                        if (typeof row.IDS !== "string") continue
                        if (typeof row.source !== "string") continue
                        insertRow(
                            { UCS: row.UCS, source: row.source, IDS: row.IDS },
                            parseBabelStoneIdsSourceExpression(row.source),
                        )
                    }
                    selectIds.free()
                }
                for (const row of options.additionalIds ?? []) {
                    insertRow(row, [row.source])
                }
                insertTempids.free()
                db.run(`commit`)
            } catch (err) {
                db.run(`rollback`)
                throw err
            }

            db.run(`create index tempids_UCS on tempids (UCS)`)

            db.run(`drop table if exists tempids_UCS_source`)
            db.run(`create table tempids_UCS_source as select UCS, source from tempids`)

            let zvar: Map<string, string[]> | undefined
            if (options.expandZVariants ?? false) {
                zvar ??= new Map<string, string[]>()
                const stmt = mojiDb.prepare(
                    `select UCS, value FROM ${unihanPrefix}_kZVariant`,
                )
                while (stmt.step()) {
                    const row = stmt.getAsObject() as { UCS?: unknown, value?: unknown }
                    if (typeof row.UCS !== "string") continue
                    if (typeof row.value !== "string") continue
                    zvar.set(row.UCS, [
                        row.UCS,
                        ...row.value
                            .split(/ /g)
                            .map(x => String.fromCodePoint(parseInt(x.substr(2), 16))),
                    ])
                }
                stmt.free()
            }
            if (options.normalizeKdpvRadicalVariants ?? false) {
                zvar ??= new Map<string, string[]>()
                const stmt = mojiDb.prepare(
                    `select object, subject from "kdpv_cjkvi/radical-variant" where comment is not 'partial'`,
                )
                while (stmt.step()) {
                    const row = stmt.getAsObject() as { object?: unknown, subject?: unknown }
                    if (typeof row.object !== "string") continue
                    if (typeof row.subject !== "string") continue
                    const object = row.object
                    const subject = row.subject
                    if (object === "王") continue
                    if (object === "耂") continue
                    if (object === "肀") continue
                    if (object === "𦓐") continue
                    if (object === "𡿨") continue
                    if (object === "𨈑") continue
                    if (object === "𢖩") continue
                    if (object === "𣱱") continue
                    if (object === "𨈐") continue
                    if (object === "𤣥") continue
                    if (object === "𤣩") {
                        zvar.set("𤣩", ["王"])
                        continue
                    }
                    zvar.set(object, [subject])
                }
                stmt.free()
            }

            db.run(`drop table if exists fallback`)
            db.run(`create table fallback(UCS, source, fallback)`)
            const decomposer = new IDSDecomposer(
                db,
                {
                    lookupIDS: db.prepare(
                        `select IDS_tokens, min(source) from tempids
                         where UCS = $char and source glob $source
                         group by IDS_tokens`,
                    ),
                    insertFallback: db.prepare(
                        `insert into fallback(UCS, source, fallback) values ($char, $source, $fallback)`,
                    ),
                },
                options,
            )
            if (zvar) decomposer.zvar = zvar
            try {
                decomposer.assertAcyclic()
            } catch (error) {
                decomposer.close()
                throw error
            }
            return decomposer
        } finally {
            mojiDb.close()
        }
    }

    saveToFile(filePath = this.savePath) {
        if (!filePath) {
            throw new Error("dbpath is not set")
        }
        fs.writeFileSync(filePath, Buffer.from(this.db.export()))
    }

    close() {
        this.lookupIDSStatement.free()
        this.insertFallbackStatement.free()
        this.db.close()
    }

    /**
     * Replace x=？ pattern to x=x
     */
    private replaceSingleWildcardToCharItself() {
        this.db.run(`
          update tempids
          set IDS_tokens = UCS
          where IDS_tokens = '？'
        `)
    }
    /**
     * Replace all subtractions into IDSs not containing subtractions.
     *
     * examples:
     * - replace 𠆱=⿰亻㇯斗丶 into 𠆱=⿰亻x and 斗=⿻x丶
     * - replace 㱐=㇯武㇂ into 武=⿻㱐㇂
     *
     * where x stands for a unique token
     */
    private reduceAllSubtractions() {
        function* invert(char: string, subtraction: string[]): Generator<[char: string, tokens: string[]]> {
            if ((subtraction[0] !== "⊖") && (subtraction[0] !== "㇯")) throw new RangeError("the first token of subtraction is not ⊖")
            if (nodeLength(subtraction, 1) !== 1) throw new Error("unimplemented")
            // char = ㇯ minuend subtrahend
            // ≡ minuend = ⿻ char subtrahend
            const minuend = subtraction[1]
            const subtrahend = subtraction.slice(2)
            if (nodeLength(subtrahend, 0) !== subtrahend.length) throw new RangeError("the subtrahend is not complete IDS")
            if (subtrahend.includes("⊖") || subtrahend.includes("㇯")) throw new Error("unimplemented")
            yield [minuend, ["⿻", char, ...subtrahend]]
        }
        function* process(char: string, tokens: string[]): Generator<[char: string, tokens: string[]]> {
            const i = tokens.findIndex(t => t === "⊖" || t === "㇯")
            if (i < 0) {
                yield [char, tokens]
                return
            }
            if (i === 0) {
                yield* invert(char, tokens)
                return
            }
            const eigenToken = `&s-${tokens[i + 1]}-${encodeTokensToXmlName(tokens.slice(i + 2, i + 2 + nodeLength(tokens, i + 2)))};`
            const subtraction = tokens.splice(i, nodeLength(tokens, i), eigenToken)
            yield* process(char, tokens)
            yield* invert(eigenToken, subtraction)
        }
        const pairs: { UCS: string, source: string, IDS_tokens: string }[] = []
        const select = this.db.prepare(
            `select UCS, source, IDS_tokens from tempids where IDS_tokens glob '*[⊖㇯]*'`,
        )
        while (select.step()) {
            const row = select.getAsObject() as { UCS?: unknown, source?: unknown, IDS_tokens?: unknown }
            if (typeof row.UCS !== "string") continue
            if (typeof row.source !== "string") continue
            if (typeof row.IDS_tokens !== "string") continue
            pairs.push({ UCS: row.UCS, source: row.source, IDS_tokens: row.IDS_tokens })
        }
        select.free()
        this.db.run(`delete from tempids where IDS_tokens glob '*[⊖㇯]*'`)
        const insert = this.db.prepare(`insert into tempids (UCS, source, IDS_tokens) values (?, ?, ?)`)
        for (const { UCS, source, IDS_tokens } of pairs) {
            for (const [char, tokens] of process(UCS, IDS_tokens.split(" "))) {
                insert.run([char, source, tokens.join(" ")])
            }
        }
        insert.free()
    }
    private expand(token: string) {
        return this.zvar?.get(token) ?? [token]
    }
    private atomicMemo = new Set<string>()
    private resolveIDS(char: string, source: string): ResolvedIDS[] {
        if (char[0] === "{" ||
            idsOperatorRegExp.test(char)) {
            return [{ idsTokens: char, selectedSource: source }]
        }
        if (char[0] === "&") {
            const defined = this.lookupIDSFromDb({ char, source })
            if (defined.length > 0) return defined
            return [{ idsTokens: char, selectedSource: source }]
        }
        const atomicKey = `${char}${source}`
        if (this.atomicMemo.has(atomicKey)) {
            return [{ idsTokens: char, selectedSource: source }]
        }
        const alltokens = this.lookupIDSFromDb({ char, source })
        if (alltokens.length === 1 && alltokens[0].idsTokens === char) {
            this.atomicMemo.add(atomicKey)
            return alltokens
        }
        if (alltokens.length > 0) return alltokens
        const fallback = this.fallbackLookupIDS(char, source)
        if (fallback) return fallback
        this.atomicMemo.add(atomicKey)
        return [{ idsTokens: char, selectedSource: source }]
    }
    private lookupIDS(char: string, source: string): string[] {
        return this.resolveIDS(char, source).map(row => row.idsTokens)
    }
    private fallbackMemo = new Map<string, ResolvedIDS[]>()
    private fallbackLookupIDS(char: string, source: string): ResolvedIDS[] | undefined {
        const fallbackKey = `${char}:${source}`
        if (this.fallbackMemo.has(fallbackKey)) {
            return this.fallbackMemo.get(fallbackKey)
        }
        const alltokens = this.lookupIDSFromDb({ char, source: "*" })
        if (alltokens.length === 1) {
            this.fallbackMemo.set(fallbackKey, alltokens)
            return alltokens
        }
        const sources = fallbackSourceOrder.filter(s => s !== source)
        for (const fallbackSource of sources) {
            const alltokens = this.lookupIDSFromDb({ char, source: fallbackSource })
            if (alltokens.length > 0) {
                this.insertFallbackStatement.run({ $char: char, $source: source, $fallback: fallbackSource })
                this.fallbackMemo.set(fallbackKey, alltokens)
                return alltokens
            }
        }
    }

    private lookupIDSFromDb(params: { char: string, source: string }): ResolvedIDS[] {
        const out: ResolvedIDS[] = []
        this.lookupIDSStatement.bind({ $char: params.char, $source: params.source })
        while (this.lookupIDSStatement.step()) {
            const row = this.lookupIDSStatement.get()
            if (typeof row[0] === "string" && typeof row[1] === "string") {
                out.push({ idsTokens: row[0], selectedSource: row[1] })
            }
        }
        this.lookupIDSStatement.reset()
        return out
    }
    /**
     * Reject every effective structural cycle before recursive enumeration.
     *
     * States retain the requested source because recursive calls do too.
     * Resolution records the actual row source selected by fallback.
     */
    private assertAcyclic() {
        type State = { char: string, source: string }
        type Frame = {
            state: State
            edges: IDSDecompositionCycleStep[]
            next: number
            incoming?: IDSDecompositionCycleStep
        }
        const stateKey = ({ char, source }: State) => `${char}\u0000${source}`
        const edgesFor = ({ char, source }: State) => {
            const edges: IDSDecompositionCycleStep[] = []
            for (const expandedChar of this.expand(char)) {
                for (const row of this.resolveIDS(expandedChar, source)) {
                    const tokens = row.idsTokens.split(/ /g)
                    if (tokens.length === 1 && tokens[0] === char) continue
                    if (tokens[0] === "⊖" || tokens[0] === "㇯") continue
                    for (const dependency of tokens) {
                        if (dependency[0] === "&" ||
                            dependency[0] === "{" ||
                            dependency === "？" ||
                            idsOperatorRegExp.test(dependency)) {
                            continue
                        }
                        edges.push({
                            char,
                            source,
                            expandedChar,
                            selectedSource: row.selectedSource,
                            idsTokens: row.idsTokens,
                            dependency,
                        })
                    }
                }
            }
            return edges
        }

        const roots = this.allCharSources()
        const completed = new Set<string>()
        const active = new Map<string, number>()
        for (const root of roots) {
            if (completed.has(stateKey(root))) continue
            const stack: Frame[] = [{ state: root, edges: edgesFor(root), next: 0 }]
            active.set(stateKey(root), 0)
            while (stack.length > 0) {
                const frame = stack[stack.length - 1]
                if (frame.next >= frame.edges.length) {
                    completed.add(stateKey(frame.state))
                    active.delete(stateKey(frame.state))
                    stack.pop()
                    continue
                }
                const edge = frame.edges[frame.next++]
                const target = { char: edge.dependency, source: edge.source }
                const targetKey = stateKey(target)
                const cycleStart = active.get(targetKey)
                if (cycleStart !== undefined) {
                    const witness = stack
                        .slice(cycleStart + 1)
                        .flatMap(item => item.incoming ? [item.incoming] : [])
                    witness.push(edge)
                    throw new IDSDecompositionCycleError(witness)
                }
                if (completed.has(targetKey)) continue
                active.set(targetKey, stack.length)
                stack.push({
                    state: target,
                    edges: edgesFor(target),
                    next: 0,
                    incoming: edge,
                })
            }
        }
    }
    private *decompose(token: string, source: string): Generator<string[]> {
        const chars = this.expand(token)
        for (const char of chars) {
            const alltokens = this.lookupIDS(char, source)
            let unknownid = 0
            for (const tokens of alltokens) {
                yield tokens.split(/ /g).flatMap(token => {
                    if (token === "？") {
                        return `&c-${char}-${++unknownid};`
                    } else if (token === "⿻") {
                        // add a hidden argument to the overlaid operator
                        return ["&OL3;", `&ol-${char}-${++unknownid};`]
                    } else {
                        return token
                    }
                })
            }
        }
    }
    *decomposeAll(char: string, source: string): Generator<string[]> {
        for (const tokens of this.decompose(char, source)) {
            if (tokens.length === 1 && tokens[0] === char) {
                // atomic component (whose IDS is the character itself)
                yield tokens
            } else if (tokens[0] === '⊖' || tokens[0] === '㇯') {
                // treat the char as an atomic component
                yield [char]
            } else {
                yield* this.decomposeTokens(tokens, source)
            }
        }
    }
    private *mapDecomposeAll(tokens: string[], source: string): Generator<() => Iterable<string[]>> {
        let i = 0
        while (i < tokens.length) {
            const token = tokens[i++]
            yield () => this.decomposeAll(token, source)
        }
    }
    *decomposeTokens(tokens: string[], source: string): Generator<string[]> {
        const allDecomposed = allCombinations(Array.from(this.mapDecomposeAll(tokens, source)))
        for (const decomposed of allDecomposed) {
            yield normalizeOverlaid(decomposed.flat())
        }
    }
    allCharSources(): { char: string, source: string }[] {
        const out: { char: string, source: string }[] = []
        const stmt = this.db.prepare(
            `select distinct UCS as char, source from tempids_UCS_source`,
        )
        while (stmt.step()) {
            const row = stmt.getAsObject() as { char?: unknown, source?: unknown }
            if (typeof row.char !== "string") continue
            if (typeof row.source !== "string") continue
            out.push({ char: row.char, source: row.source })
        }
        stmt.free()
        return out
    }
    allFallbacks(): { char: string, source: string }[] {
        const a = []
        for (const k of this.fallbackMemo.keys()) {
            const [char, source] = k.split(":")
            a.push({ char, source })
        }
        return a
    }
}
