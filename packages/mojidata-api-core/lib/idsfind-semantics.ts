import {
  decomposedIdsQueryPlan,
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
    // Databases built before the semantics manifest used this transform.
    return decomposedIdsQueryPlan
  }
  const row = await db.queryOne<{ query_plan_json?: unknown }>(`
    SELECT query_plan_json
    FROM idsfind_semantics
    WHERE schema_version = 1
  `)
  if (typeof row?.query_plan_json !== "string") {
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
