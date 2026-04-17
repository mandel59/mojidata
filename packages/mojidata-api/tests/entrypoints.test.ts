import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createSqlApiDb } from '../core'
import { createApp } from '../hono'
import { createMojidataDbProvider, createSqlJsExecutor, openDatabaseFromFile } from '../sqljs'

describe('package entrypoints', () => {
  test('exports core, hono, and sqljs helpers', () => {
    assert.equal(typeof createSqlApiDb, 'function')
    assert.equal(typeof createApp, 'function')
    assert.equal(typeof createMojidataDbProvider, 'function')
    assert.equal(typeof createSqlJsExecutor, 'function')
    assert.equal(typeof openDatabaseFromFile, 'function')
  })
})
