import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { importRecipe } from "./prepare-mojidata-d1-import.mjs"

export const defaultWriteBudget = 100_000

export function checkImportArtifacts(outputDir, bindings, writeBudget = defaultWriteBudget) {
  if (!Number.isSafeInteger(writeBudget) || writeBudget < 0) {
    throw new Error("--max-rows-written must be a nonnegative safe integer")
  }
  const manifestPath = path.join(outputDir, "manifest.json")
  if (!fs.existsSync(manifestPath)) throw new Error("Missing import manifest; regenerate dumps with prepare-mojidata-d1-import.mjs")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  if (manifest.formatVersion !== 2 || !Array.isArray(manifest.entries)) {
    throw new Error("Legacy import manifest: regenerate dumps to avoid remote materialization and index backfills")
  }
  const mapping = { MOJIDATA_DB: ["mojidata", "mojidata.sql"], IDSFIND_DB: ["idsdb-fts5", "idsdb-fts5.sql"] }
  const plans = bindings.map(binding => {
    const [name, filename] = mapping[binding] ?? []
    if (!name) throw new Error(`Unknown import binding ${binding}`)
    const entries = manifest.entries.filter(entry => entry.name === name)
    if (entries.length !== 1) throw new Error(`Expected one import manifest entry for ${name}`)
    const entry = entries[0]
    if (entry.importPlan?.recipe !== importRecipe ||
        !Number.isSafeInteger(entry.importPlan.minimumRowsWritten) || entry.importPlan.minimumRowsWritten < 0) {
      throw new Error(`Missing local-materialization import plan for ${name}; regenerate dumps`)
    }
    const sqlPath = path.join(outputDir, filename)
    const data = fs.readFileSync(sqlPath)
    if (data.length !== entry.outputByteLength ||
        createHash("sha256").update(data).digest("hex") !== entry.outputSha256) {
      throw new Error(`Import artifact hash/size mismatch for ${name}; regenerate dumps`)
    }
    return { binding, sqlPath, ...entry.importPlan }
  })
  const minimumRowsWritten = plans.reduce((sum, plan) => sum + plan.minimumRowsWritten, 0)
  if (minimumRowsWritten > writeBudget) {
    throw new Error(`Import needs at least ${minimumRowsWritten} row writes, above the ${writeBudget} write budget. ` +
      "Full imports cannot fit the Free daily allowance. Use a bounded data delta, or verify the account's available write budget before specifying --max-rows-written. " +
      "This is a lower bound, not a billing estimate; FTS and other engine maintenance can add writes.")
  }
  return { plans, minimumRowsWritten, writeBudget }
}
