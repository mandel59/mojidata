import fs from "fs/promises"
import path from "path"
import { JSDOM } from "jsdom"

const TR38_URL = process.env["TR38_URL"] ?? "https://www.unicode.org/reports/tr38/"
const TR38_CACHE_PATH = process.env["TR38_CACHE_PATH"]
    ?? path.join(__dirname, "../../cache/unihan-tr38-properties.json")

export type UnihanPropertyDoc = Record<string, string>

export function parseUnihanDoc(html: string): UnihanPropertyDoc[] {
    const jsdom = new JSDOM(html)
    const removed = jsdom.window.document.querySelectorAll(".removed")
    for (const r of removed) {
        r.remove()
    }
    const tables = jsdom.window.document.querySelectorAll("table[summary]")
    const array = []
    for (const t of tables) {
        const entity = t.getAttribute("summary")
        if (!entity || !entity.match(/^k\w+$/)) {
            continue
        }
        const obj: Record<string, string> = Object.fromEntries(Array.from(t.querySelectorAll("tr")).map(tr => {
            const th = tr.querySelector("td:nth-child(1)")
            const td = tr.querySelector("td:nth-child(2)")
            const attribute = th?.textContent?.trim()
            const value = td?.textContent?.trim()
            return [attribute, value]
        }).filter((entry): entry is [string, string] => {
            return Boolean(entry[0] && entry[1] != null)
        }))
        array.push(obj)
    }
    return array
}

async function loadUnihanDocCache(cachePath = TR38_CACHE_PATH): Promise<UnihanPropertyDoc[] | null> {
    try {
        const text = await fs.readFile(cachePath, "utf8")
        return JSON.parse(text) as UnihanPropertyDoc[]
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return null
        }
        throw err
    }
}

async function saveUnihanDocCache(
    array: UnihanPropertyDoc[],
    cachePath = TR38_CACHE_PATH,
) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    await fs.writeFile(cachePath, JSON.stringify(array, null, 2) + "\n", "utf8")
}

export async function scrapeUnihanDoc() {
    const cached = await loadUnihanDocCache()
    if (cached) {
        return cached
    }

    try {
        const jsdom = await JSDOM.fromURL(TR38_URL)
        const array = parseUnihanDoc(jsdom.serialize())
        await saveUnihanDocCache(array)
        return array
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
            `Failed to load TR38 property metadata from ${TR38_URL}. ` +
            `No cache was found at ${TR38_CACHE_PATH}. ` +
            `Run the build once with network access to populate the cache, or provide TR38_CACHE_PATH. ` +
            `Original error: ${message}`,
        )
    }
}

async function main() {
    const array = await scrapeUnihanDoc()
    for (const obj of array) {
        console.log(JSON.stringify(obj))
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(err)
        process.exitCode = 1
    })
}
