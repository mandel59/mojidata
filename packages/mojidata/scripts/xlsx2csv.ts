import fs from "fs"
import xlsx from "xlsx"

let [input, output] = process.argv.slice(2)

if (input == null) {
    process.exit(1)
}

if (output == null) {
    output = input + ".csv"
}

const outputFile = fs.createWriteStream(output)

const book = xlsx.readFile(input)
const sheet = book.Sheets[book.SheetNames[0]]

const csvStream = xlsx.stream.to_csv(sheet) as import("stream").Readable

csvStream.pipe(outputFile)
