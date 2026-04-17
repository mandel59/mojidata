import assert from 'node:assert/strict'
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
})
