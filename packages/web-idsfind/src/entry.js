import { createDbWorker } from "sql.js-httpvfs"
import { tokenizeIDS } from "@mandel59/idstool/lib/ids-tokenizer"
import { query } from "@mandel59/idstool/lib/idsfind-query"

const workerUrl = new URL(
    "sql.js-httpvfs/dist/sqlite.worker.js",
    import.meta.url).href
const wasmUrl = new URL(
    "sql.js-httpvfs/dist/sql-wasm.wasm",
    import.meta.url).href
const dbUrl = new URL(
    "@mandel59/idstool/idsfind.db",
    import.meta.url).href

const workerPromise = createDbWorker(
    [{
        from: "inline",
        config: {
            serverMode: "full",
            requestChunkSize: 1024,
            url: dbUrl,
        }
    }],
    workerUrl,
    wasmUrl,
)

window.addEventListener("DOMContentLoaded", async () => {
    const worker = await workerPromise
    /** @type {HTMLInputElement} */
    const input = document.getElementById("input")
    const output = document.getElementById("output")
    let isUpdating = false
    async function update() {
        if (isUpdating) return
        try {
            isUpdating = true
            const result = await worker.db.exec(
                query,
                {
                    "$idslist": JSON.stringify(
                        input.value.split(/\s/g)
                            .map(ids => tokenizeIDS(ids)))
                }
            )
            output.innerHTML = ""
            if (result.length === 0) return
            const [{ values }] = result
            for (const [ucs] of values) {
                const node = document.createElement("div")
                node.innerText = `${ucs}`
                output.appendChild(node)
            }
        } finally {
            isUpdating = false
        }
    }
    update()
    input.addEventListener("change", () => update())
})

window.worker = await workerPromise
