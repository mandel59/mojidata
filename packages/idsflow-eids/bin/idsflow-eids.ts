#!/usr/bin/env node
import fs from "node:fs"
import { convertEidsToIdsFlowJsonl } from "../lib/eids"

function usage(): never {
    throw new Error("usage: idsflow-eids --data-source NAME INPUT.eids")
}

export function run(args: string[]): { output: string, summary: string } {
    if (args.length !== 3 || args[0] !== "--data-source") usage()
    const dataSource = args[1]
    const inputPath = args[2]
    if (!dataSource || !inputPath) usage()
    const converted = convertEidsToIdsFlowJsonl(
        fs.readFileSync(inputPath, "utf8"),
        dataSource,
    )
    return {
        output: converted.output,
        summary: `converted ${converted.entries} entries; skipped ${converted.skipped}`,
    }
}

if (require.main === module) {
    try {
        const result = run(process.argv.slice(2))
        process.stdout.write(result.output)
        process.stderr.write(result.summary + "\n")
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    }
}
