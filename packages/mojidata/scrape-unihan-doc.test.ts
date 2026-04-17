import test from "ava"
import fs from "fs/promises"
import os from "os"
import path from "path"

import { ensureUnihanDocCache, parseUnihanDoc } from "./scripts/scraper/scrape-unihan-doc"

test("parseUnihanDoc extracts Unihan property metadata and ignores removed rows", t => {
    const html = `<!doctype html>
<html>
  <body>
    <table summary="kDefinition">
      <tr><td>Property</td><td>kDefinition</td></tr>
      <tr class="removed"><td>Delimiter</td><td>semicolon</td></tr>
      <tr><td>Delimiter</td><td>space</td></tr>
      <tr><td>Description</td><td>drop me</td></tr>
    </table>
    <table summary="not-a-property">
      <tr><td>Property</td><td>ignored</td></tr>
    </table>
  </body>
</html>`

    t.deepEqual(parseUnihanDoc(html), [
        {
            Property: "kDefinition",
            Delimiter: "space",
        },
    ])
})

test("scrapeUnihanDoc reads cached JSON when TR38_CACHE_PATH is set", async t => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mojidata-tr38-cache-"))
    const cachePath = path.join(tempDir, "unihan-tr38-properties.json")
    const cached = [
        { Property: "kRSUnicode", Delimiter: "space" },
    ]
    await fs.writeFile(cachePath, JSON.stringify(cached), "utf8")

    const prev = process.env["TR38_CACHE_PATH"]
    process.env["TR38_CACHE_PATH"] = cachePath

    try {
        delete require.cache[require.resolve("./scripts/scraper/scrape-unihan-doc")]
        const { scrapeUnihanDoc } = require("./scripts/scraper/scrape-unihan-doc") as typeof import("./scripts/scraper/scrape-unihan-doc")
        t.deepEqual(await scrapeUnihanDoc(), cached)
    } finally {
        if (prev == null) {
            delete process.env["TR38_CACHE_PATH"]
        } else {
            process.env["TR38_CACHE_PATH"] = prev
        }
        await fs.rm(tempDir, { recursive: true, force: true })
    }
})

test("ensureUnihanDocCache reports cache hits", async t => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mojidata-tr38-cache-hit-"))
    const cachePath = path.join(tempDir, "unihan-tr38-properties.json")
    const cached = [
        { Property: "kTotalStrokes", Delimiter: "space" },
    ]
    await fs.writeFile(cachePath, JSON.stringify(cached), "utf8")

    t.deepEqual(await ensureUnihanDocCache(cachePath), {
        source: "cache",
        properties: cached,
        cachePath,
    })

    await fs.rm(tempDir, { recursive: true, force: true })
})
