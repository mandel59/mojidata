import {
  getRegisteredIdsQueryPlan,
  legacyIdsQueryPlan,
  parseIdsQueryPlan,
  type IdsQueryPlan,
} from "@mandel59/idsdb-utils"

import type { SqlExecutor } from "./sql-executor"

const queryPlanByDatabase = new WeakMap<SqlExecutor, Promise<IdsQueryPlan>>()

async function loadIdsQueryPlan(db: SqlExecutor): Promise<IdsQueryPlan> {
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
  if (row.schema_version === 2) {
    if (typeof row.semantics_profile !== "string") {
      throw new Error("idsfind_semantics schema 2 has no semantics profile")
    }
    if (!Object.prototype.hasOwnProperty.call(row, "recipe_sha256")) {
      throw new Error("idsfind_semantics schema 2 has no recipe identity field")
    }
    if (
      row.recipe_sha256 !== null &&
      (
        typeof row.recipe_sha256 !== "string" ||
        !/^[0-9a-f]{64}$/u.test(row.recipe_sha256)
      )
    ) {
      throw new Error("idsfind_semantics schema 2 has invalid recipe identity")
    }
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
  let value: unknown
  try {
    value = JSON.parse(row.query_plan_json)
  } catch {
    throw new Error("idsfind_semantics query plan is not valid JSON")
  }
  return parseIdsQueryPlan(value)
}

export function getIdsQueryPlan(db: SqlExecutor): Promise<IdsQueryPlan> {
  let plan = queryPlanByDatabase.get(db)
  if (!plan) {
    plan = loadIdsQueryPlan(db)
    queryPlanByDatabase.set(db, plan)
  }
  return plan
}
