import { ensureUnihanDocCache } from "./scraper/scrape-unihan-doc"

async function main() {
    const { source, properties, cachePath } = await ensureUnihanDocCache()
    console.log(`${source}:${cachePath}:${properties.length}`)
}

if (require.main === module) {
    main().catch(err => {
        console.error(err)
        process.exitCode = 1
    })
}
