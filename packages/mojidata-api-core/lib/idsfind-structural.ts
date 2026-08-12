import {
  collectIdsFtsFeatures,
  encodeIdsFtsEqualityFeature,
  idsFtsFeatureVersion,
  tokenArgs,
  type IdsFtsFeatureFamily,
} from "@mandel59/idsdb-utils"

import { idsfindStructuralQuery } from "./idsfind-query"
import {
  ftsIdsfindCandidateProvider,
  type IdsfindCandidateProvider,
} from "./idsfind-sql"
import type { SqlExecutor } from "./sql-executor"

function isStableStructuralToken(token: string) {
  return tokenArgs[token] !== undefined
}

function compilePatternFeatures(
  pattern: readonly string[],
  families: ReadonlySet<IdsFtsFeatureFamily>,
) {
  const anchoredAtRoot = pattern[0] === "§" &&
    pattern[pattern.length - 1] === "§"
  const tokens = pattern.filter(token => token !== "§")
  const enabled: IdsFtsFeatureFamily[] = []
  if (anchoredAtRoot && families.has("root")) enabled.push("root")
  if (families.has("edge")) enabled.push("edge")
  const features = collectIdsFtsFeatures(tokens, {
    families: enabled,
    // A literal character may expand before exact matching. IDC tokens do not.
    includeToken: isStableStructuralToken,
  })
  if (!anchoredAtRoot || !families.has("equality")) return features

  const variablePaths = new Map<string, number[][]>()
  const visitNode = (
    index: number,
    path: number[],
  ): { next: number; complete: boolean } => {
    if (index >= tokens.length) return { next: index, complete: false }
    const token = tokens[index]
    if (/^[a-zａ-ｚ]$/u.test(token)) {
      const paths = variablePaths.get(token) ?? []
      paths.push(path)
      variablePaths.set(token, paths)
    }
    const arity = tokenArgs[token] ?? 0
    let next = index + 1
    let complete = true
    for (let childIndex = 0; childIndex < arity; childIndex++) {
      const child = visitNode(next, [...path, childIndex])
      next = child.next
      complete &&= child.complete
    }
    return { next, complete }
  }
  const parsed = visitNode(0, [])
  if (!parsed.complete || parsed.next !== tokens.length) return features
  for (const paths of variablePaths.values()) {
    for (let index = 1; index < paths.length; index++) {
      features.push(encodeIdsFtsEqualityFeature(paths[0], paths[index]))
    }
  }
  return [...new Set(features)]
}

export function compileIdsfindStructuralPattern(
  idslist: readonly (readonly (readonly string[])[])[],
  requestedFamilies: readonly IdsFtsFeatureFamily[],
) {
  const families = new Set(requestedFamilies)
  const groupPatterns: string[] = []
  for (const alternatives of idslist) {
    const alternativePatterns: string[] = []
    let groupHasUnfilteredAlternative = false
    for (const pattern of alternatives) {
      const features = compilePatternFeatures(pattern, families)
      if (features.length === 0) {
        groupHasUnfilteredAlternative = true
        break
      }
      alternativePatterns.push(
        "(" + features.map(term => `IDS_features : ${term}`).join(" AND ") + ")",
      )
    }
    if (groupHasUnfilteredAlternative || alternativePatterns.length === 0) {
      continue
    }
    groupPatterns.push("(" + [...new Set(alternativePatterns)].join(" OR ") + ")")
  }
  return groupPatterns.length === 0 ? undefined : groupPatterns.join(" AND ")
}

export function createStructuralFtsIdsfindCandidateProvider(
  families: readonly IdsFtsFeatureFamily[],
): IdsfindCandidateProvider {
  const validatedDatabases = new WeakSet<SqlExecutor>()
  const validateDatabase = async (db: SqlExecutor) => {
    if (validatedDatabases.has(db)) return
    const rows = await db.query<{
      feature_version?: unknown
      families?: unknown
    }>(`
      SELECT feature_version, families
      FROM idsfind_structural_meta
      WHERE schema_version = 1
    `)
    const metadata = rows[0]
    const available = typeof metadata?.families === "string"
      ? new Set(metadata.families.split(","))
      : new Set<string>()
    if (
      metadata?.feature_version !== idsFtsFeatureVersion ||
      families.some(family => !available.has(family))
    ) {
      throw new Error(
        "idsfind structural FTS metadata does not provide " +
          families.join(","),
      )
    }
    validatedDatabases.add(db)
  }
  return {
    async getCandidates(db, idslist, sourceIdslist) {
      const structuralPattern = compileIdsfindStructuralPattern(
        sourceIdslist ?? idslist,
        families,
      )
      if (structuralPattern === undefined) {
        return ftsIdsfindCandidateProvider.getCandidates(db, idslist)
      }
      await validateDatabase(db)
      const rows = await db.query<{ UCS?: string }>(idsfindStructuralQuery, {
        $idslist: JSON.stringify(idslist),
        $structural_pattern: structuralPattern,
      })
      return rows.flatMap(row => typeof row.UCS === "string" ? [row.UCS] : [])
    },
  }
}
