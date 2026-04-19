import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export type Scenario = {
  name: string
  description: string
  pathname: string
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>
}

export type ScenarioManifest = {
  scenarioSetVersion: number
  scenarios: Scenario[]
}

export function loadScenarioManifest(): ScenarioManifest {
  const manifestPath = resolve(__dirname, "scenarios.json")
  return JSON.parse(readFileSync(manifestPath, "utf8")) as ScenarioManifest
}
