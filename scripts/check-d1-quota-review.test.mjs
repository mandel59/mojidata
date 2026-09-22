import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, requiresQuotaReview, validateReviews } from "./check-d1-quota-review.mjs";
const path = "docs/d1-quota-reviews/change.json";
function fixture(decision = "unchanged") {
  const values = { "packages/shared/query.ts": "SELECT value FROM source", "docs/evidence.md": "plan and measurements" };
  const read = file => { if (!(file in values)) throw Object.assign(new Error(file), { code: "ENOENT" }); return Buffer.from(values[file]); };
  const review = { version: 1, decision, evidence: ["docs/evidence.md"], files: { "packages/shared/query.ts": fingerprint("packages/shared/query.ts", read) } };
  for (const key of ["scope", "beforeAfter", "accountBudget", "validation", "rolloutAndStop"]) review[key] = "Concrete explanation with local evidence for this change.";
  const save = () => values[path] = JSON.stringify(review);
  save();
  return { values, read, review, save, files: ["packages/shared/query.ts", path] };
}
test("covers shared code, new packages, operational tools and dependencies", () => {
  for (const file of ["packages/new/query.ts", "packages/ui/app.tsx", "scripts/new-tool.py", ".github/workflows/release.yml", "yarn.lock", "AGENTS.md"]) assert.ok(requiresQuotaReview(file));
  assert.equal(requiresQuotaReview("docs/ordinary.md"), false);
});
test("requires newly changed review and rejects missing or stale fingerprints", () => {
  const f = fixture();
  validateReviews(f.files, f.read);
  assert.throws(() => validateReviews([f.files[0]], f.read), /Missing/);
  f.values[f.files[0]] += " changed";
  assert.throws(() => validateReviews(f.files, f.read), /stale/);
});
test("deleted and renamed code also requires coverage", () => {
  const f = fixture(); delete f.values[f.files[0]];
  assert.throws(() => validateReviews(f.files, f.read), /stale/);
  f.review.files[f.files[0]] = "deleted"; f.save(); validateReviews(f.files, f.read);
  f.values["packages/new/query.ts"] = "moved";
  assert.throws(() => validateReviews([...f.files, "packages/new/query.ts"], f.read), /Missing/);
});
test("bounded decisions reject unknown costs and account-wide exhaustion", () => {
  const f = fixture("bounded");
  assert.throws(() => validateReviews(f.files, f.read), /upper bounds/);
  f.review.budget = Object.fromEntries(["reads", "writes"].map(key => [key, { limit: 100000, existing: 30000, trafficReserve: 50000, operationUpperBound: 20000 }]));
  f.save(); validateReviews(f.files, f.read);
  f.review.budget.writes.operationUpperBound++; f.save();
  assert.throws(() => validateReviews(f.files, f.read), /exceeds/);
  f.review.budget.writes.operationUpperBound = null; f.save();
  assert.throws(() => validateReviews(f.files, f.read), /upper bounds/);
});
test("rejects absent evidence, incomplete reviews and malformed JSON", () => {
  const f = fixture("blocked"); validateReviews(f.files, f.read);
  delete f.values["docs/evidence.md"]; assert.throws(() => validateReviews(f.files, f.read));
  f.values["docs/evidence.md"] = "restored"; f.review.accountBudget = "TODO"; f.save();
  assert.throws(() => validateReviews(f.files, f.read), /accountBudget/);
  f.values[path] = "{"; assert.throws(() => validateReviews(f.files, f.read));
});
