import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { tokenArgs } from "@mandel59/idsdb-utils"
import { tokenizeIdsList } from "@mandel59/mojidata-api-core/lib/idsfind-tokenize"

const repositoryRoot = resolve(__dirname, "../../..")
const idsgrepSource = {
  version: "0.6",
  url: "https://tsukurimashou.org/files/idsgrep-0.6.tar.gz",
  sha256: "2c07029bab12d9ceefddf447ce4213535b68d020b093a593190c2afa8a577c7c",
}
const directIdcs = new Set([
  "⿰", "⿱", "⿲", "⿳", "⿴", "⿵",
  "⿶", "⿷", "⿸", "⿹", "⿺", "⿻",
])
const idsgrepSyntaxCharacters = new Set(
  Array.from("()[]{}<>,;?.&|!*=@/#"),
)

function parseArgs(argv: string[]) {
  let manifestPath: string | undefined
  let outputPath: string | undefined
  for (let index = 0; index < argv.length; index++) {
    switch (argv[index]) {
      case "--manifest": manifestPath = argv[++index]; break
      case "--output": outputPath = argv[++index]; break
      default: throw new Error(`Unknown argument: ${argv[index]}`)
    }
  }
  if (!manifestPath || !outputPath) {
    throw new Error("Usage: --manifest <json> --output <json>")
  }
  return {
    manifestPath: resolve(repositoryRoot, manifestPath),
    outputPath: resolve(repositoryRoot, outputPath),
  }
}

function parseCompleteNode(tokens: readonly string[], index: number): number | undefined {
  if (index >= tokens.length) return undefined
  let next = index + 1
  for (let child = 0; child < (tokenArgs[tokens[index]] ?? 0); child++) {
    const childEnd = parseCompleteNode(tokens, next)
    if (childEnd === undefined) return undefined
    next = childEnd
  }
  return next
}

function classifyPattern(pattern: readonly string[]) {
  const reasons = new Set<string>()
  const wholeAnchored = pattern[0] === "§" &&
    pattern[pattern.length - 1] === "§"
  if (!wholeAnchored) reasons.add("not-whole-anchored")
  const tokens = pattern.filter(token => token !== "§")
  if (parseCompleteNode(tokens, 0) !== tokens.length) {
    reasons.add("not-one-complete-tree")
  }

  const variableCounts = new Map<string, number>()
  for (const token of tokens) {
    if (/^[a-zａ-ｚ]$/u.test(token)) {
      variableCounts.set(token, (variableCounts.get(token) ?? 0) + 1)
      continue
    }
    if (token === "？") continue
    const arity = tokenArgs[token] ?? 0
    if (arity > 0) {
      if (!directIdcs.has(token)) {
        reasons.add("operator-outside-idsgrep-0.6-direct-ids")
      }
      continue
    }
    const characters = Array.from(token)
    if (
      characters.length !== 1 ||
      idsgrepSyntaxCharacters.has(characters[0])
    ) {
      reasons.add("encoded-or-syntax-sensitive-atomic-token")
    }
  }
  if ([...variableCounts.values()].some(count => count > 1)) {
    reasons.add("repeated-variable-binding")
  }

  const eligible = reasons.size === 0
  return {
    eligible,
    reasons: [...reasons].sort(),
    idsgrepQuery: eligible
      ? tokens.map(token =>
        token === "？" || /^[a-zａ-ｚ]$/u.test(token) ? "?" : token
      ).join("")
      : undefined,
    variableCounts: Object.fromEntries(variableCounts),
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifestBytes = readFileSync(options.manifestPath)
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    caseSetVersion: number
    cases: { name: string; ids: string[] }[]
  }

  const cases = manifest.cases.map(entry => {
    const tokenized = tokenizeIdsList(entry.ids).forAudit
    if (tokenized.length !== 1 || tokenized[0].length !== 1) {
      return {
        name: entry.name,
        eligible: false,
        reasons: ["multiple-groups-or-alternatives"],
      }
    }
    return {
      name: entry.name,
      ...classifyPattern(tokenized[0][0]),
    }
  })
  const reasonCounts = new Map<string, number>()
  for (const entry of cases) {
    for (const reason of entry.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    }
  }
  const eligible = cases.filter(entry => entry.eligible)
  const payload = {
    formatVersion: 1,
    caseSetVersion: manifest.caseSetVersion,
    manifest: {
      path: options.manifestPath,
      sha256: createHash("sha256").update(manifestBytes).digest("hex"),
    },
    idsgrepSource,
    directFragment: {
      rootMatching: "IDSgrep default recursive tree matching at the dictionary root",
      wildcard: "Mojidata single-use variable or ？ maps to IDSgrep ?",
      operators: "Unicode IDS U+2FF0..U+2FFB only",
      equalityBoundary:
        "IDSgrep 0.6 has no variable binding or backreference; .=. is literal-functor matching, not sibling-subtree equality",
      encodedAtomBoundary:
        "Multi-code-point Mojidata entity tokens require a separate proven EIDS encoding",
    },
    summary: {
      cases: cases.length,
      eligible: eligible.length,
      excluded: cases.length - eligible.length,
      reasonCounts: Object.fromEntries(
        [...reasonCounts].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    cases,
  }
  writeFileSync(options.outputPath, JSON.stringify(payload, null, 2) + "\n")
  process.stdout.write(JSON.stringify(payload.summary, null, 2) + "\n")
}

main()
