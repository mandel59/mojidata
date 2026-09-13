import {
    formatIdsFlowRecordsJsonl,
    tokenArgs,
    tokenizeIDS,
} from "@mandel59/idsdb-utils"

export type EidsIdsEntry = {
    UCS: string
    source: "*"
    IDS: string
}

export type EidsConversionResult = {
    entries: EidsIdsEntry[]
    skipped: {
        missingOrUnsupportedHead: number
        unsupportedTree: number
    }
}

export type EidsStructuralHeadProjection = {
    output: string
    removed: number
}

export type EidsParityProjection = {
    output: string
    entries: number
    skipped: EidsConversionResult["skipped"]
    removedStructuralHeads: number
}

type EidsNode = {
    head?: string
    functor: string
    children: EidsNode[]
}

type Bracket = {
    open: string
    close: string
    arity: number
}

const headBrackets: Bracket[] = [
    { open: "<", close: ">", arity: -1 },
    { open: "【", close: "】", arity: -1 },
    { open: "〖", close: "〗", arity: -1 },
]

const functorBrackets: Bracket[] = [
    { open: "(", close: ")", arity: 0 },
    { open: "（", close: "）", arity: 0 },
    { open: "｟", close: "｠", arity: 0 },
    { open: ".", close: ".", arity: 1 },
    { open: ":", close: ":", arity: 1 },
    { open: "・", close: "・", arity: 1 },
    { open: "[", close: "]", arity: 2 },
    { open: "［", close: "］", arity: 2 },
    { open: "〚", close: "〛", arity: 2 },
    { open: "{", close: "}", arity: 3 },
    { open: "〔", close: "〕", arity: 3 },
    { open: "〘", close: "〙", arity: 3 },
]

const canonicalFunctors = new Map<string, string>([
    ["lr", "⿰"],
    ["tb", "⿱"],
    ["lcr", "⿲"],
    ["tcb", "⿳"],
    ["enclose", "⿴"],
    ["wrapu", "⿵"],
    ["wrapd", "⿶"],
    ["wrapl", "⿷"],
    ["wrapul", "⿸"],
    ["wrapur", "⿹"],
    ["wrapll", "⿺"],
    ["overlap", "⿻"],
])

const plainFunctorArities: Partial<Record<string, number>> = {
    ";": 0, ",": 2, "?": 0, ".": 1, "&": 2, "|": 2,
    "!": 1, "*": 1, "=": 1, "@": 1, "/": 1, "#": 1,
}

class EidsParser {
    private offset = 0

    constructor(private readonly input: string) {}

    parseAll(): EidsNode[] {
        const nodes: EidsNode[] = []
        this.skipWhitespace()
        while (this.offset < this.input.length) {
            nodes.push(this.parseNode())
            this.skipWhitespace()
        }
        return nodes
    }

    private parseNode(): EidsNode {
        this.skipWhitespace()
        if (this.offset >= this.input.length) this.fail("expected EIDS node")

        let head: string | undefined
        const headBracket = headBrackets.find(({ open }) => this.input.startsWith(open, this.offset))
        if (headBracket) head = this.readBracketed(headBracket)

        this.skipWhitespace()
        if (this.offset >= this.input.length) this.fail("missing EIDS functor")

        const functorBracket = functorBrackets.find(({ open }) => this.input.startsWith(open, this.offset))
        let functor: string
        let arity: number
        if (functorBracket) {
            functor = this.readBracketed(functorBracket)
            arity = functorBracket.arity
        } else {
            functor = this.readEscapedCharacter()
            const canonical = canonicalFunctors.get(functor) ?? functor
            arity = tokenArgs[canonical] ?? plainFunctorArities[canonical] ?? 0
        }
        functor = canonicalFunctors.get(functor) ?? functor

        const children: EidsNode[] = []
        for (let i = 0; i < arity; i++) children.push(this.parseNode())
        return { head, functor, children }
    }

    private readBracketed(bracket: Bracket): string {
        this.offset += bracket.open.length
        let result = ""
        while (this.offset < this.input.length) {
            if (this.input.startsWith(bracket.close, this.offset)) {
                this.offset += bracket.close.length
                return result
            }
            result += this.readEscapedCharacter()
        }
        this.fail(`unclosed ${bracket.open} bracket`)
    }

    private readEscapedCharacter(): string {
        const first = this.readCharacter()
        if (first !== "\\") return first
        if (this.offset >= this.input.length) this.fail("trailing escape")

        const escape = this.readCharacter()
        if (escape === "x" && this.input.startsWith("{", this.offset)) {
            const end = this.input.indexOf("}", this.offset + 1)
            if (end < 0) this.fail("unclosed hexadecimal escape")
            const hex = this.input.slice(this.offset + 1, end)
            this.offset = end + 1
            return this.codePointEscape(hex)
        }
        if (escape === "x") return this.fixedCodePointEscape(2)
        if (escape === "X") return this.fixedCodePointEscape(4)
        const controls: Record<string, string> = {
            a: "\x07", b: "\b", e: "\x1b", f: "\f", n: "\n",
            r: "\r", t: "\t", v: "\v",
        }
        return controls[escape] ?? escape
    }

    private fixedCodePointEscape(length: number): string {
        const hex = this.input.slice(this.offset, this.offset + length)
        if (hex.length !== length) this.fail("short hexadecimal escape")
        this.offset += length
        return this.codePointEscape(hex)
    }

    private codePointEscape(hex: string): string {
        if (!/^[0-9A-F]+$/iu.test(hex)) this.fail("invalid hexadecimal escape")
        const codePoint = Number.parseInt(hex, 16)
        if (!Number.isSafeInteger(codePoint) || codePoint > 0x10ffff) {
            this.fail("invalid Unicode code point")
        }
        return String.fromCodePoint(codePoint)
    }

    private readCharacter(): string {
        const codePoint = this.input.codePointAt(this.offset)
        if (codePoint === undefined) this.fail("unexpected end of EIDS input")
        const value = String.fromCodePoint(codePoint)
        this.offset += value.length
        return value
    }

    private skipWhitespace() {
        while (this.offset < this.input.length) {
            const match = /^\s/u.exec(this.input.slice(this.offset))
            if (!match) return
            this.offset += match[0].length
        }
    }

    private fail(message: string): never {
        const line = this.input.slice(0, this.offset).split("\n").length
        throw new Error(`${message} at line ${line}, offset ${this.offset}`)
    }
}

function headToken(head: string): string | undefined {
    const characters = Array.from(head)
    if (characters.length === 1) return head
    if (characters.length === 2 && /^[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]$/u.test(characters[1])) {
        return head
    }
    if (/^[A-Za-z0-9][A-Za-z0-9_.:+-]*$/u.test(head)) return `&${head};`
    return undefined
}

function convertNode(node: EidsNode): string | undefined {
    const arity = tokenArgs[node.functor]
    if (node.children.length > 0) {
        if (arity !== node.children.length) return undefined
        const children = node.children.map(convertNode)
        if (children.some(child => child === undefined)) return undefined
        return node.functor + children.join("")
    }

    if (node.functor === ";") return node.head ? headToken(node.head) : undefined
    if (arity !== undefined) return undefined
    const tokens = tokenizeIDS(node.functor)
    return tokens.length === 1 && tokens[0] === node.functor ? node.functor : undefined
}

function escapeBracketed(value: string, close: string): string {
    return Array.from(value, character =>
        character === "\\" || character === close
            ? `\\${character}`
            : character
    ).join("")
}

function escapePlainCharacter(value: string): string {
    if (
        value === "\\" ||
        /^\s$/u.test(value) ||
        headBrackets.some(({ open }) => open === value) ||
        functorBrackets.some(({ open }) => open === value)
    ) {
        return `\\x{${value.codePointAt(0)!.toString(16)}}`
    }
    return value
}

function serializeFunctor(node: EidsNode): string {
    if (
        Array.from(node.functor).length === 1 &&
        (tokenArgs[node.functor] ?? plainFunctorArities[node.functor] ?? 0) ===
            node.children.length
    ) {
        return escapePlainCharacter(node.functor)
    }
    const bracket = functorBrackets.find(({ arity }) =>
        arity === node.children.length
    )
    if (!bracket) {
        throw new Error(`unsupported EIDS arity: ${node.children.length}`)
    }
    return bracket.open + escapeBracketed(node.functor, bracket.close) +
        bracket.close
}

function serializeHeadlessNode(
    node: EidsNode,
    countRemoved: () => void,
): string {
    const keepHead = node.children.length === 0 && node.functor === ";"
    if (node.head && !keepHead) countRemoved()
    const head = keepHead && node.head
        ? `【${escapeBracketed(node.head, "】")}】`
        : ""
    return head + serializeFunctor(node) +
        node.children.map(child =>
            serializeHeadlessNode(child, countRemoved)
        ).join("")
}

function serializeParityNode(
    node: EidsNode,
    isRoot: boolean,
    countRemoved: () => void,
): string {
    const keepHead = isRoot ||
        (node.children.length === 0 && node.functor === ";")
    if (node.head && !keepHead) countRemoved()
    const head = keepHead && node.head
        ? "【" + escapeBracketed(node.head, "】") + "】"
        : ""
    return head + serializeFunctor(node) +
        node.children.map(child =>
            serializeParityNode(child, false, countRemoved)
        ).join("")
}

export function dropEidsStructuralHeads(
    input: string,
): EidsStructuralHeadProjection {
    let removed = 0
    const output = new EidsParser(input).parseAll().map(node =>
        serializeHeadlessNode(node, () => removed++)
    ).join("\n")
    return { output: output.length === 0 ? "" : `${output}\n`, removed }
}

export function projectEidsParityCorpus(input: string): EidsParityProjection {
    const skipped: EidsConversionResult["skipped"] = {
        missingOrUnsupportedHead: 0,
        unsupportedTree: 0,
    }
    let removedStructuralHeads = 0
    const output: string[] = []
    for (const node of new EidsParser(input).parseAll()) {
        if (!node.head || !headToken(node.head)) {
            skipped.missingOrUnsupportedHead++
            continue
        }
        if (!convertNode(node)) {
            skipped.unsupportedTree++
            continue
        }
        output.push(serializeParityNode(
            node,
            true,
            () => removedStructuralHeads++,
        ))
    }
    return {
        output: output.length === 0 ? "" : output.join("\n") + "\n",
        entries: output.length,
        skipped,
        removedStructuralHeads,
    }
}

export function convertEidsDictionary(input: string): EidsConversionResult {
    const result: EidsConversionResult = {
        entries: [],
        skipped: { missingOrUnsupportedHead: 0, unsupportedTree: 0 },
    }
    for (const node of new EidsParser(input).parseAll()) {
        const UCS = node.head ? headToken(node.head) : undefined
        if (!UCS) {
            result.skipped.missingOrUnsupportedHead++
            continue
        }
        const IDS = convertNode(node)
        if (!IDS) {
            result.skipped.unsupportedTree++
            continue
        }
        result.entries.push({ UCS, source: "*", IDS })
    }
    return result
}

export function convertEidsToIdsFlowJsonl(input: string, dataSource: string): {
    output: string
    entries: number
    skipped: number
} {
    if (dataSource.length === 0) throw new Error("dataSource must not be empty")
    const converted = convertEidsDictionary(input)
    const skipped = converted.skipped.missingOrUnsupportedHead +
        converted.skipped.unsupportedTree
    return {
        output: formatIdsFlowRecordsJsonl(
            converted.entries.map(row => ({
                char: row.UCS,
                IDS: row.IDS,
                idsDataSource: dataSource,
                irgSource: null,
            })),
            { skipped },
        ),
        entries: converted.entries.length,
        skipped,
    }
}
