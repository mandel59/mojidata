import {
  getRegisteredIdsQueryPlan,
  legacyIdsQueryPlan,
  parseIdsQueryPlan,
  type IdsQueryPlan,
} from "@mandel59/idsdb-utils"

import type { SqlExecutor } from "./sql-executor"

export interface IdsQueryPlanLoadPolicy {
  allowExperimental?: boolean
}

const queryPlanByDatabase =
  new WeakMap<SqlExecutor, Map<boolean, Promise<IdsQueryPlan>>>()

async function loadIdsQueryPlan(
  db: SqlExecutor,
  policy: IdsQueryPlanLoadPolicy,
): Promise<IdsQueryPlan> {
  const table = await db.queryOne<{ name?: unknown }>(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'idsfind_semantics'
  `)
  if (table?.name !== "idsfind_semantics") {
    // Databases built before the semantics manifest used both legacy stages.
    return legacyIdsQueryPlan
  }
  const row = await db.queryOne<Record<string, unknown>>(`
    SELECT *
    FROM idsfind_semantics
    ORDER BY schema_version DESC
    LIMIT 1
  `)
  if (!row) {
    throw new Error("idsfind_semantics has no manifest row")
  }
  if (row.schema_version === 3) {
    if (!Object.prototype.hasOwnProperty.call(row, "recipe_sha256")) {
      throw new Error("idsfind_semantics schema 3 has no recipe identity field")
    }
    validateRecipeIdentity(row.recipe_sha256, 3)
    if (row.semantics_mode === "registered") {
      if (typeof row.semantics_profile !== "string") {
        throw new Error("idsfind_semantics schema 3 has no semantics profile")
      }
      if (row.query_plan_json !== null) {
        throw new Error("registered IDS query semantics must not embed a query plan")
      }
      return getRegisteredIdsQueryPlan(row.semantics_profile)
    }
    if (row.semantics_mode === "experimental") {
      if (!policy.allowExperimental) {
        throw new Error(
          "experimental IDS query semantics require explicit runtime opt-in",
        )
      }
      if (row.semantics_profile !== null) {
        throw new Error("experimental IDS query semantics must not use a profile")
      }
      if (typeof row.query_plan_json !== "string") {
        throw new Error("experimental IDS query semantics have no query plan")
      }
      return parseQueryPlanJson(row.query_plan_json)
    }
    throw new Error(
      `unsupported IDS query semantics mode: ${String(row.semantics_mode)}`,
    )
  }
  if (row.schema_version === 2) {
    if (typeof row.semantics_profile !== "string") {
      throw new Error("idsfind_semantics schema 2 has no semantics profile")
    }
    if (!Object.prototype.hasOwnProperty.call(row, "recipe_sha256")) {
      throw new Error("idsfind_semantics schema 2 has no recipe identity field")
    }
    validateRecipeIdentity(row.recipe_sha256, 2)
    return getRegisteredIdsQueryPlan(row.semantics_profile)
  }
  if (row.schema_version !== 1) {
    throw new Error(
      `unsupported idsfind_semantics schema version: ${String(row.schema_version)}`,
    )
  }
  if (typeof row.query_plan_json !== "string") {
    throw new Error("idsfind_semantics schema 1 has no query plan")
  }
  return parseQueryPlanJson(row.query_plan_json)
}

function validateRecipeIdentity(value: unknown, schemaVersion: number) {
  if (
    value !== null &&
    (
      typeof value !== "string" ||
      !/^[0-9a-f]{64}$/u.test(value)
    )
  ) {
    throw new Error(
      `idsfind_semantics schema ${schemaVersion} has invalid recipe identity`,
    )
  }
}

function parseQueryPlanJson(text: string): IdsQueryPlan {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error("idsfind_semantics query plan is not valid JSON")
  }
  return parseIdsQueryPlan(value)
}

export function getIdsQueryPlan(
  db: SqlExecutor,
  policy: IdsQueryPlanLoadPolicy = {},
): Promise<IdsQueryPlan> {
  let plans = queryPlanByDatabase.get(db)
  if (!plans) {
    plans = new Map()
    queryPlanByDatabase.set(db, plans)
  }
  const allowExperimental = policy.allowExperimental === true
  let plan = plans.get(allowExperimental)
  if (!plan) {
    plan = loadIdsQueryPlan(db, { allowExperimental })
    plans.set(allowExperimental, plan)
  }
  return plan
}
