import { JSDOM } from "jsdom"

export async function scrapeUnihanDoc() {
    const jsdom = await JSDOM.fromURL("https://www.unicode.org/reports/tr38/")
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
            const attribute = th!!.textContent
            const value = td!!.textContent
            return [attribute, value]
        }))
        array.push(obj)
    }
    return array
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
