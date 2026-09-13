import type { IdsFlowRecord } from "./idsflow"

export const idsFlowRecordsFormat = "idsflow-records"
export const idsFlowRecordsVersion = 1

export type ParsedIdsFlowRecords = {
    records: IdsFlowRecord[]
    skipped: number
}

type Mapping = Record<string, unknown>

function mapping(value: unknown, at: string): Mapping {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${at} must be a JSON object`)
    }
    return value as Mapping
}

function only(value: Mapping, allowed: string[], at: string) {
    const unknown = Object.keys(value).find(key => !allowed.includes(key))
    if (unknown) throw new Error(`${at} has unknown key: ${unknown}`)
}

function string(value: unknown, at: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${at} must be a non-empty string`)
    }
    return value
}

function parseLine(line: string, lineNumber: number): Mapping {
    try {
        return mapping(JSON.parse(line), `line ${lineNumber}`)
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`line ${lineNumber} is not valid JSON: ${error.message}`)
        }
        throw error
    }
}

export function parseIdsFlowRecordsJsonl(input: string): ParsedIdsFlowRecords {
    const lines = input.split(/\r?\n/u)
        .map((line, index) => ({ text: line.trim(), number: index + 1 }))
        .filter(line => line.text.length > 0)
    if (lines.length === 0) throw new Error("IDSFlow records input is empty")
    const header = parseLine(lines[0].text, lines[0].number)
    if (header.format !== idsFlowRecordsFormat || header.version !== idsFlowRecordsVersion) {
        throw new Error(`line ${lines[0].number} must declare ${idsFlowRecordsFormat} version ${idsFlowRecordsVersion}`)
    }
    only(header, ["format", "version", "skipped"], `line ${lines[0].number}`)
    const skipped = header.skipped ?? 0
    if (!Number.isSafeInteger(skipped) || (skipped as number) < 0) {
        throw new Error(`line ${lines[0].number}.skipped must be a non-negative integer`)
    }
    const records = lines.slice(1).map(({ text, number }) => {
        const row = parseLine(text, number)
        only(row, ["char", "IDS", "ids_data_source", "irg_source"], `line ${number}`)
        const irgSource = row.irg_source === null
            ? null
            : string(row.irg_source, `line ${number}.irg_source`)
        return {
            char: string(row.char, `line ${number}.char`),
            IDS: string(row.IDS, `line ${number}.IDS`),
            idsDataSource: string(row.ids_data_source, `line ${number}.ids_data_source`),
            irgSource,
        }
    })
    return { records, skipped: skipped as number }
}

export function formatIdsFlowRecordsJsonl(
    records: readonly IdsFlowRecord[],
    options: { skipped?: number } = {},
): string {
    const skipped = options.skipped ?? 0
    if (!Number.isSafeInteger(skipped) || skipped < 0) {
        throw new Error("skipped must be a non-negative integer")
    }
    const lines = [JSON.stringify({
        format: idsFlowRecordsFormat,
        version: idsFlowRecordsVersion,
        ...(skipped === 0 ? {} : { skipped }),
    })]
    for (const row of records) {
        lines.push(JSON.stringify({
            char: row.char,
            IDS: row.IDS,
            ids_data_source: row.idsDataSource,
            irg_source: row.irgSource,
        }))
    }
    return lines.join("\n") + "\n"
}
