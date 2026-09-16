import assert from "node:assert/strict";
import test from "node:test";
import { pendingReleases, publicPackages } from "./pending-npm-releases.mjs";

const pkg = { name: "@test/example", version: "1.2.3" };
test("published versions skip publishing; missing versions remain pending", async () => {
  assert.deepEqual(await pendingReleases([pkg], async url => {
    assert.equal(url, "https://registry.npmjs.org/%40test%2Fexample/1.2.3");
    return Response.json(pkg);
  }), []);
  assert.deepEqual(await pendingReleases([pkg], async () => new Response(null, { status: 404 })), [pkg]);
});
test("partial releases retain only missing versions", async () => {
  const next = { ...pkg, version: "1.2.4" };
  assert.deepEqual(await pendingReleases([pkg, next], async url => url.endsWith("1.2.3")
    ? Response.json(pkg) : new Response(null, { status: 404 })), [next]);
});
test("lookup failures and unexpected metadata do not silently skip publishing", async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(pendingReleases([pkg], async () => new Response(null, { status })), /lookup failed/);
  }
  await assert.rejects(pendingReleases([pkg], async () => { throw new Error("network unavailable"); }), /network unavailable/);
  await assert.rejects(pendingReleases([pkg], async () => Response.json({ ...pkg, version: "other" })), /Unexpected npm metadata/);
});
test("private and ignored workspaces are excluded from registry checks", () => {
  const packages = publicPackages(process.cwd());
  assert.ok(packages.length > 0);
  assert.ok(packages.every(pkg => !pkg.private));
  assert.ok(!packages.some(pkg => ["@mandel59/idsflow-eids", "@mandel59/mojidata-api-bench", "@mandel59/mojidata-api-d1-worker"].includes(pkg.name)));
});
