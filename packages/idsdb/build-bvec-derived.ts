import {
    copyFileSync,
    mkdirSync,
    renameSync,
    rmSync,
    statSync,
} from "fs"
import path from "path"
import { performance } from "perf_hooks"
import Database from "better-sqlite3"

import { buildIdsfindBvec } from "./lib/idsfind-bvec-db"

type Options = {
    basePath: string
    outputPath: string
}

const repositoryRoot = path.resolve(__dirname, "../..")

function parseArgs(argv: string[]): Options {
    let basePath: string | undefined
    let outputPath: string | undefined
    for (let index = 0; index < argv.length; index++) {
        switch (argv[index]) {
            case "--base":
                basePath = argv[++index]
                break
            case "--output":
                outputPath = argv[++index]
                break
            default:
                throw new Error(`Unknown argument: ${argv[index]}`)
        }
    }
    if (!basePath || !outputPath) {
        throw new Error("Usage: --base <idsfind.db> --output <idsfind-bvec.db>")
    }
    const resolvedBase = path.resolve(repositoryRoot, basePath)
    const resolvedOutput = path.resolve(repositoryRoot, outputPath)
    if (resolvedBase === resolvedOutput) {
        throw new Error("--output must differ from --base")
    }
    return { basePath: resolvedBase, outputPath: resolvedOutput }
}

function main() {
    const options = parseArgs(process.argv.slice(2))
    mkdirSync(path.dirname(options.outputPath), { recursive: true })
    const temporaryPath = options.outputPath + ".tmp-" + process.pid
    rmSync(temporaryPath, { force: true })

    const startedAt = performance.now()
    copyFileSync(options.basePath, temporaryPath)
    const copiedAt = performance.now()
    let metadata: unknown
    try {
        const db = new Database(temporaryPath)
        try {
            const buildMeta = db.prepare(
                "SELECT source_filter, expand_z_variants, " +
                "normalize_kdpv_radical_variants, page_size " +
                "FROM idsfind_build_meta WHERE schema_version = 1",
            ).get()
            if (!buildMeta) {
                throw new Error("Base database lacks idsfind_build_meta schema 1")
            }
            db.exec(`
                DROP TABLE idsfind_fts;
                DROP TABLE idsfind_ref;
                UPDATE idsfind_build_meta
                SET index_mode = 'bvec'
                WHERE schema_version = 1;
            `)
            buildIdsfindBvec(db)
            db.exec("VACUUM")
            metadata = db.prepare(
                "SELECT * FROM idsfind_bvec_meta WHERE schema_version = 1",
            ).get()
        } finally {
            db.close()
        }
        renameSync(temporaryPath, options.outputPath)
    } catch (error) {
        rmSync(temporaryPath, { force: true })
        throw error
    }
    const finishedAt = performance.now()
    console.log(JSON.stringify({
        basePath: options.basePath,
        outputPath: options.outputPath,
        baseBytes: statSync(options.basePath).size,
        outputBytes: statSync(options.outputPath).size,
        copyMs: copiedAt - startedAt,
        derivedBuildMs: finishedAt - copiedAt,
        totalMs: finishedAt - startedAt,
        metadata,
    }, null, 2))
}

main()
