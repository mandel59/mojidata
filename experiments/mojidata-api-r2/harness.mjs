import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('.', import.meta.url))

export async function startWorker({ files, cache, limits, persist }) {
  const buildResult = await build({
    absWorkingDir: root, entryPoints: ['src/worker.mjs'], bundle: true, write: false,
    format: 'esm', platform: 'browser', external: ['./sqlite.wasm'],
    // Keep this standalone npm experiment independent of the parent's PnP map.
    plugins: [{ name: 'local-npm', setup(b) {
      b.onResolve({ filter: /^[^./]/ }, a => ({ path: require.resolve(a.path, { paths: [a.resolveDir] }) }))
    } }],
  })
  return new Miniflare(convertV4MiniflareOptions({
    name: 'mojidata-r2-local-experiment', compatibilityDate: '2026-09-22',
    modules: [
      { type: 'ESModule', path: `${root}worker.mjs`, contents: buildResult.outputFiles[0].text },
      { type: 'CompiledWasm', path: `${root}sqlite.wasm`, contents: await readFile(`${root}node_modules/wa-sqlite/dist/wa-sqlite-async.wasm`) },
    ],
    r2Buckets: { DB: 'local-experiment-only' }, ...(persist ? { resourcePersistencePath: persist, isolatedResourcePersistencePath: persist } : {}),
    bindings: { FILES: files, CACHE: cache ?? {}, LIMITS: limits ?? {} },
  }))
}
