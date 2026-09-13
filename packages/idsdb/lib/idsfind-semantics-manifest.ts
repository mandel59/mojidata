import Database from "better-sqlite3"
import type { IdsQuerySemantics } from "@mandel59/idsdb-utils"

export function writeIdsfindSemanticsManifest(
    db: Database.Database,
    semantics: IdsQuerySemantics,
    recipeSha256: string | null,
) {
    db.exec(`CREATE TABLE "idsfind_semantics" (
        schema_version INTEGER PRIMARY KEY,
        semantics_mode TEXT NOT NULL,
        semantics_profile TEXT,
        query_plan_json TEXT,
        recipe_sha256 TEXT
    )`)
    db.prepare(`INSERT INTO idsfind_semantics (
        schema_version, semantics_mode, semantics_profile,
        query_plan_json, recipe_sha256
    ) VALUES (3, ?, ?, ?, ?)`).run(
        semantics.mode,
        semantics.mode === "registered" ? semantics.profile : null,
        semantics.mode === "experimental"
            ? JSON.stringify(semantics.queryPlan)
            : null,
        recipeSha256,
    )
}
