import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'

import { createSqlApiDb } from '../core'
import { createApp } from '../hono'
import { createMojidataApiWorkerClient, createNodeApp, createNodeDb } from '../runtime'
import { createMojidataDbProvider, createSqlJsExecutor, openDatabaseFromFile } from '../sqljs'

describe('package entrypoints', () => {
  test('exports core, hono, runtime, and sqljs helpers', () => {
    assert.equal(typeof createSqlApiDb, 'function')
    assert.equal(typeof createApp, 'function')
    assert.equal(typeof createNodeApp, 'function')
    assert.equal(typeof createNodeDb, 'function')
    assert.equal(typeof createMojidataApiWorkerClient, 'function')
    assert.equal(typeof createMojidataDbProvider, 'function')
    assert.equal(typeof createSqlJsExecutor, 'function')
    assert.equal(typeof openDatabaseFromFile, 'function')
    assert.equal(typeof createNodeDb({ backend: 'better-sqlite3' }), 'object')
  })

  test('declares only facade subpath exports', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
    ) as { exports: Record<string, unknown> }

    assert.deepEqual(Object.keys(packageJson.exports).sort(), [
      '.',
      './api/v1/_lib/*',
      './app',
      './browser-client',
      './browser-worker',
      './core',
      './hono',
      './node',
      './runtime',
      './sqljs',
    ])
  })

  test('keeps api/v1/_lib compatibility wrappers', async () => {
    const [coreCompat, sqljsCompat, honoCompat, runtimeCompat, jsonCompat] = await Promise.all([
      import('@mandel59/mojidata-api/api/v1/_lib/libsearch'),
      import('@mandel59/mojidata-api/api/v1/_lib/sqljs-node'),
      import('@mandel59/mojidata-api/api/v1/_lib/cast'),
      import('@mandel59/mojidata-api/api/v1/_lib/iterator-utils'),
      import('@mandel59/mojidata-api/api/v1/_lib/json-encoder'),
    ])

    assert.equal(typeof coreCompat.createLibSearch, 'function')
    assert.equal(typeof sqljsCompat.openDatabaseFromFile, 'function')
    assert.equal(typeof honoCompat.castToStringArray, 'function')
    assert.equal(typeof runtimeCompat.take, 'function')
    assert.equal(typeof jsonCompat.writeObject, 'function')
  })

  test('keeps api/v1 handler compatibility wrappers', async () => {
    const [mojidataCompat, ivsCompat, variantsCompat, idsfindCompat] =
      await Promise.all([
        import('../api/v1/mojidata'),
        import('../api/v1/ivs-list'),
        import('../api/v1/mojidata-variants'),
        import('../api/v1/idsfind'),
      ])

    assert.equal(typeof mojidataCompat.createMojidataHandler, 'function')
    assert.equal(typeof ivsCompat.createIvsListHandler, 'function')
    assert.equal(typeof variantsCompat.createMojidataVariantsHandler, 'function')
    assert.equal(typeof idsfindCompat.createIdsfindHandler, 'function')
  })
})
