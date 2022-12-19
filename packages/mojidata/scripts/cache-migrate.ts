import { readdir, readFile } from "fs/promises"
import { createHash } from "crypto"
import { join, basename, extname } from "path"

async function main() {
    const args = process.argv.slice(2)
    const [downloadfile = "download.txt", cacheSha1 = "cache/.sha1sum", cacheSha256 = "cache/.sha256sum"] = args
    console.log(`mkdir -p ${cacheSha256}`)
    for (const file of await readdir(cacheSha1)) {
        const ext = extname(file)
        const base = basename(file, ext)
        const blob = await readFile(join(cacheSha1, file))
        const hashSha1 = createHash("sha1")
        const hashSha256 = createHash("sha256")
        hashSha1.write(blob)
        hashSha256.write(blob)
        const digestSha1 = hashSha1.digest("hex")
        const digestSha256 = hashSha256.digest("hex")
        console.log(`cp ${join(cacheSha1, file)} ${join(cacheSha256, `${base.slice(0, base.length - 41)}-${digestSha256}${ext}`)}`)
        console.log(`sed 's/ ${digestSha1} / ${digestSha256} /g' "${downloadfile}" > "${downloadfile}.tmp"`)
        console.log(`mv "${downloadfile}.tmp" "${downloadfile}"`)
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(err)
        process.exit(1)
    })
}
