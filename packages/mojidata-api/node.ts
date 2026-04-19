export type NodeDbBackend = "sqljs"
export {
  createSqlJsApp as createNodeApp,
  createSqlJsDb as createNodeDb,
} from "@mandel59/mojidata-api-sqljs"
