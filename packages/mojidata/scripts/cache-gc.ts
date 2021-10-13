import { readdir, readFile, unlink } from "fs/promises"
import { join } from "path"
import { basename, extname } from "path"

async function main() {
    const args = process.argv.slice(2)
    const [downloadfile = "download.txt", cachedir = "cache/.sha1sum"] = args

    const downloadlist = await readFile(downloadfile, "utf-8")
    const records = downloadlist
        .replace(/^#.*\n|^\s*\n/mgu, '')
        .trim()
        .split('\n')
        .map(line => line.trim().split(/\s+/))
    const saveFiles = new Set()
    for (const [name, sha1sum, _url] of records) {
        const ext = extname(name)
        const base = basename(name, ext)
        const hashname = `${base}-${sha1sum}${ext}`
        saveFiles.add(hashname)
    }
    for (const file of await readdir(cachedir)) {
        if (!saveFiles.has(file)) {
            console.log(`rm ${join(cachedir, file)}`)
        } else {
            console.log(`#save ${join(cachedir, file)}`)
        }
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(err)
        process.exit(1)
    })
}
