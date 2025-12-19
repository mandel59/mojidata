import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright"
import { createServer } from "vite"
import react from "@vitejs/plugin-react"

function contentTypeByPath(filePath: string) {
  if (filePath.endsWith(".wasm")) return "application/wasm"
  if (filePath.endsWith(".db")) return "application/octet-stream"
  return "application/octet-stream"
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function shouldLogUrl(url: string) {
  return (
    url.includes("/assets/") ||
    url.includes("sql.js") ||
    url.includes("/@id/") ||
    url.includes("browser-worker") ||
    url.includes("@mandel59/mojidata-api") ||
    url.includes("/packages/mojidata-api/") ||
    url.includes("idsdb-utils") ||
    url.includes("/packages/idsdb-utils/") ||
    url.includes("/packages/idsdb/")
  )
}

test(
  "integration: useMojidataApi runs mojidata-api in browser and returns data",
  { timeout: 90_000 },
  async () => {
    const pkgDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    )
    const fixtureRoot = path.join(pkgDir, "tests", "fixture-app")
    const repoRoot = path.resolve(pkgDir, "..", "..")

    const requireFromHere = createRequire(import.meta.url)
    const mojidataApiPkgJson = requireFromHere.resolve(
      "@mandel59/mojidata-api/package.json",
    )
    const requireFromMojidataApi = createRequire(mojidataApiPkgJson)
    const sqlWasmPath = requireFromMojidataApi.resolve("sql.js/dist/sql-wasm.wasm")

    const initSqlJsMod = requireFromMojidataApi("sql.js") as any
    const initSqlJs = initSqlJsMod?.default ?? initSqlJsMod
    const SQL = await initSqlJs({ locateFile: () => sqlWasmPath })

    const mojiDb = new SQL.Database()
    mojiDb.exec(`CREATE TABLE _dummy (x integer);`)
    const mojiDbBytes = mojiDb.export()
    mojiDb.close()

    const idsfindDb = new SQL.Database()
    idsfindDb.exec(`
      CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
      CREATE TABLE idsfind_ref (docid INTEGER PRIMARY KEY, char TEXT NOT NULL);
      CREATE VIRTUAL TABLE idsfind_fts USING fts4 (
        content="",
        tokenize=unicode61 "tokenchars=§⿰",
        IDS_tokens
      );

      INSERT INTO idsfind (UCS, IDS_tokens) VALUES ('灶', '⿰ 火 土');
      INSERT INTO idsfind_ref (docid, char) VALUES (1, '灶');
      INSERT INTO idsfind_fts (docid, IDS_tokens) VALUES (1, '§ ⿰ 火 土 §');
    `)
    const idsfindDbBytes = idsfindDb.export()
    idsfindDb.close()

    const pageLogs: string[] = []
    const seenLogKeys = new Set<string>()
    const workerProbes: Promise<void>[] = []
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    let url: string | undefined
    let browser: Awaited<ReturnType<(typeof chromium)["launch"]>> | undefined
    let context:
      | Awaited<ReturnType<Awaited<ReturnType<(typeof chromium)["launch"]>>["newContext"]>>
      | undefined
    let page: Awaited<ReturnType<Awaited<typeof browser>["newPage"]>> | undefined
    try {
      server = await createServer({
        root: fixtureRoot,
        logLevel: "error",
        plugins: [
          react(),
          {
            name: "serve-mojidata-assets",
            configureServer(viteServer) {
              const serveBytes =
                (bytes: Uint8Array) =>
                (_req: any, res: any) => {
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/octet-stream")
                  res.setHeader("Content-Length", String(bytes.byteLength))
                  res.end(Buffer.from(bytes))
                }
              const serveFile =
                (filePath: string) =>
                (_req: any, res: any) => {
                  res.statusCode = 200
                  res.setHeader("Content-Type", contentTypeByPath(filePath))
                  fs.createReadStream(filePath).pipe(res)
                }
              viteServer.middlewares.use("/assets/moji.db", serveBytes(mojiDbBytes))
              viteServer.middlewares.use(
                "/assets/idsfind.db",
                serveBytes(idsfindDbBytes),
              )
              viteServer.middlewares.use(
                "/assets/sql-wasm.wasm",
                serveFile(sqlWasmPath),
              )
            },
          },
        ],
        resolve: {
          alias: {
            "@mandel59/react-mojidata-api": path.join(pkgDir, "index.ts"),
            "@mandel59/mojidata-api/app": path.join(repoRoot, "packages", "mojidata-api", "app.ts"),
            "@mandel59/mojidata-api/browser-worker": path.join(
              repoRoot,
              "packages",
              "mojidata-api",
              "browser-worker.ts",
            ),
            "@mandel59/idsdb-utils": path.join(repoRoot, "packages", "idsdb-utils", "index.ts"),
          },
          extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
        },
        server: {
          port: 0,
          strictPort: true,
          fs: {
            allow: [repoRoot],
          },
        },
      })

      await withTimeout(server.listen(), 20_000, "vite.listen()")
      url =
        server.resolvedUrls?.local?.[0] ??
        (() => {
          const addr = server.httpServer?.address()
          if (typeof addr === "object" && addr && "port" in addr) {
            return `http://localhost:${addr.port}`
          }
          throw new Error("Failed to determine dev server URL")
        })()

      browser = await withTimeout(chromium.launch(), 20_000, "chromium.launch()")
      context = await browser.newContext()
      context.on("request", (req) => {
        if (!shouldLogUrl(req.url())) return
        const key = `request:${req.url()}`
        if (seenLogKeys.has(key)) return
        seenLogKeys.add(key)
        pageLogs.push(`[request] ${req.url()}`)
      })
      context.on("requestfailed", (req) => {
        if (!shouldLogUrl(req.url())) return
        pageLogs.push(
          `[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ""}`.trim(),
        )
      })
      context.on("response", (res) => {
        if (!shouldLogUrl(res.url())) return
        const key = `response:${res.url()}:${res.status()}`
        if (seenLogKeys.has(key)) return
        seenLogKeys.add(key)
        pageLogs.push(`[response] ${res.status()} ${res.url()}`)
      })

      page = await context.newPage()
      pageLogs.length = 0
      page.on("console", (msg) => pageLogs.push(`[console:${msg.type()}] ${msg.text()}`))
      page.on("pageerror", (err) => pageLogs.push(`[pageerror] ${err?.message ?? String(err)}`))
      page.on("worker", (worker) => {
        pageLogs.push(`[worker] ${worker.url()}`)
        worker.on("close", () => pageLogs.push(`[worker:close] ${worker.url()}`))
        workerProbes.push(
          worker
            .evaluate(() => "ok")
            .then((v) => pageLogs.push(`[worker:evaluate] ${String(v)}`))
            .catch((err) =>
              pageLogs.push(`[worker:evaluate:error] ${err?.message ?? String(err)}`),
            ),
        )
      })
      page.on("websocket", (ws) => pageLogs.push(`[websocket] ${ws.url()}`))
      await withTimeout(
        page.goto(url, { waitUntil: "domcontentloaded" }),
        20_000,
        "page.goto()",
      )
      await withTimeout(
        page.waitForSelector('[data-testid="ready"]', { timeout: 20_000 }),
        25_000,
        "page.waitForSelector(ready)",
      )
      await withTimeout(
        page.waitForFunction(
          () => {
            const error = document.querySelector('[data-testid="error"]')
            if (error?.textContent) return true
            const done = document.querySelector('[data-testid="done"]')
            return done?.textContent === "true"
          },
          undefined,
          { timeout: 20_000 },
        ),
        25_000,
        "page.waitForFunction(done|error)",
      )

      const error = await page.textContent('[data-testid="error"]')
      assert.equal(error, "")

      const mojidataOk = await page.textContent('[data-testid="mojidataOk"]')
      assert.equal(mojidataOk, "true")

      const idsfindHasSample = await page.textContent(
        '[data-testid="idsfindHasSample"]',
      )
      assert.equal(idsfindHasSample, "true")
    } catch (e) {
      await Promise.race([Promise.allSettled(workerProbes), sleep(1_000)])
      const message = e instanceof Error ? e.message : String(e)
      const state = page
        ? await withTimeout(
            (async () => {
              const get = async (testId: string) =>
                (await page!.textContent(`[data-testid="${testId}"]`).catch(() => "")) ?? ""
              return {
                url: page!.url(),
                ready: await get("ready"),
                error: await get("error"),
                done: await get("done"),
                mojidataOk: await get("mojidataOk"),
                idsfindHasSample: await get("idsfindHasSample"),
                log: await get("log"),
              }
            })().catch(() => undefined),
            2_000,
            "collect state",
          )
        : undefined
      const logs = pageLogs.length ? `\n\nPage logs:\n${pageLogs.join("\n")}` : ""
      const snapshot = state ? `\n\nState:\n${JSON.stringify(state, null, 2)}` : ""
      throw new Error(`${message}${snapshot}${logs}`)
    } finally {
      await Promise.allSettled([
        browser ? withTimeout(browser.close(), 10_000, "browser.close()") : Promise.resolve(),
        server ? withTimeout(server.close(), 10_000, "server.close()") : Promise.resolve(),
        context ? withTimeout(context.close(), 10_000, "context.close()") : Promise.resolve(),
      ])
    }
  },
)
