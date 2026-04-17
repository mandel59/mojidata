import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createSqlJsExecutor } from '../api/v1/_lib/sqljs-executor'
import { getSqlJsNode } from '../api/v1/_lib/sqljs-node'

describe('createSqlJsExecutor', () => {
  test('supports positional parameters with query()', async () => {
    const SQL = await getSqlJsNode()
    const db = new SQL.Database()
    db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)')
    db.run(`INSERT INTO items (value) VALUES ('alpha'), ('beta')`)

    const executor = createSqlJsExecutor(db)
    const rows = await executor.query<{ value?: string }>(
      'SELECT value FROM items WHERE id >= ? ORDER BY id',
      [1],
    )

    assert.deepEqual(rows, [{ value: 'alpha' }, { value: 'beta' }])
  })

  test('supports named parameters with queryOne()', async () => {
    const SQL = await getSqlJsNode()
    const db = new SQL.Database()
    db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)')
    db.run(`INSERT INTO items (value) VALUES ('alpha'), ('beta')`)

    const executor = createSqlJsExecutor(db)
    const row = await executor.queryOne<{ value?: string }>(
      'SELECT value FROM items WHERE id = $id',
      { $id: 2 },
    )

    assert.deepEqual(row, { value: 'beta' })
  })

  test('returns null from queryOne() when no rows match', async () => {
    const SQL = await getSqlJsNode()
    const db = new SQL.Database()
    db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)')

    const executor = createSqlJsExecutor(db)
    const row = await executor.queryOne<{ value?: string }>(
      'SELECT value FROM items WHERE id = ?',
      [1],
    )

    assert.equal(row, null)
  })
})
