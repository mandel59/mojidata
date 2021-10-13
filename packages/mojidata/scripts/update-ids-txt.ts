import { readFile, writeFile, rename } from "fs/promises"
import { createHash } from "crypto"
import axios from "axios"

interface GitRef {
    ref: string
    node_id: string
    url: string
    object: {
        sha: string
        type: string
        url: string
    }
}

async function main() {
    const args = process.argv.slice(2)
    const [downloadfile = "download.txt"] = args

    const res = await axios.get<GitRef>("https://api.github.com/repos/mandel59/babelstone-ids/git/refs/heads/main")
    if (res.status !== 200) throw new Error(res.statusText)
    const { object: { sha } } = res.data

    const idsurl = `https://raw.githubusercontent.com/mandel59/babelstone-ids/${sha}/IDS.TXT`
    const idsres = await axios.get<Buffer>(idsurl, { responseType: "arraybuffer" })
    if (idsres.status !== 200) throw new Error(idsres.statusText)
    const filesha = createHash("sha1").update(idsres.data).digest("hex")

    let downloadlist = await readFile(downloadfile, "utf-8")
    downloadlist = downloadlist.replace(/^IDS.TXT .*$/mu, `IDS.TXT ${filesha} ${idsurl}`)
    await writeFile(`${downloadfile}.tmp`, downloadlist, "utf-8")
    await rename(`${downloadfile}.tmp`, downloadfile)
}

main()
