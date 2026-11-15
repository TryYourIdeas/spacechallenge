import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { ImportError } from '../../server/utils/csv'
import { importCsvFile, layerIdFor } from '../../server/utils/import'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'imp-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

/** Fake pool that records every SQL statement run on its single client. */
function fakePool(opts: { deleted?: number; failOn?: RegExp } = {}) {
  const log: string[] = []
  const client = {
    query: async (sql: string) => {
      log.push(sql.trim().split(/\s+/).slice(0, 3).join(' '))
      if (opts.failOn?.test(sql)) throw new Error('boom')
      if (/^\s*DELETE FROM layers/.test(sql)) return { rowCount: opts.deleted ?? 0, rows: [] }
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: 0 }] }
      return { rows: [], rowCount: 0 }
    },
    release: () => { log.push('RELEASE') },
  }
  return { pool: { connect: async () => client, query: async () => ({ rows: [] }) } as unknown as Pool, log }
}

const write = async (name: string, body: string) => { const p = join(dir, name); await writeFile(p, body); return p }
const GOOD = 'name,latitude,longitude,v\na,1,2,3\nb,4,5,6\nc,7,8,9\n'

describe('layerIdFor', () => {
  it('is a stable UUID per file name', () => {
    expect(layerIdFor('a.csv')).toBe(layerIdFor('a.csv'))
    expect(layerIdFor('a.csv')).not.toBe(layerIdFor('b.csv'))
    expect(layerIdFor('a.csv')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('importCsvFile', () => {
  it('imports valid rows in one transaction and reports counts', async () => {
    const { pool, log } = fakePool()
    const r = await importCsvFile(pool, await write('good.csv', GOOD))
    expect(r).toMatchObject({ imported: 3, skipped: 0, label: 'good', replaced: false, layerId: layerIdFor('good.csv') })
    expect(log[0]).toBe('BEGIN')
    expect(log).toContain('COMMIT')
    expect(log).not.toContain('ROLLBACK')
  })

  it('rebuilds the schema and data catalog inside the same transaction, before COMMIT', async () => {
    const { pool, log } = fakePool()
    await importCsvFile(pool, await write('cat.csv', GOOD))
    expect(log).toContain('SELECT rebuild_layer_catalog($1)')
    expect(log.indexOf('SELECT rebuild_layer_catalog($1)')).toBeLessThan(log.indexOf('COMMIT'))
  })

  it('rolls back when building the catalog fails', async () => {
    const { pool, log } = fakePool({ failOn: /rebuild_layer_catalog/ })
    await expect(importCsvFile(pool, await write('cat-fail.csv', GOOD))).rejects.toThrow('boom')
    expect(log).toContain('ROLLBACK')
    expect(log).not.toContain('COMMIT')
  })

  it('reports replaced when an existing layer was deleted', async () => {
    const { pool } = fakePool({ deleted: 1 })
    expect((await importCsvFile(pool, await write('again.csv', GOOD))).replaced).toBe(true)
  })

  it('rejects a CSV with no valid coordinates and writes nothing', async () => {
    const { pool, log } = fakePool()
    await expect(importCsvFile(pool, await write('bad.csv', 'name,latitude,longitude\na,x,y\n'))).rejects.toBeInstanceOf(ImportError)
    expect(log.some(s => s.startsWith('INSERT INTO layers'))).toBe(false)
  })

  it('rolls back when a batch insert fails', async () => {
    const { pool, log } = fakePool({ failOn: /INSERT INTO layer_points/ })
    await expect(importCsvFile(pool, await write('fail.csv', GOOD))).rejects.toThrow('boom')
    expect(log).toContain('ROLLBACK')
    expect(log).not.toContain('COMMIT')
    expect(log.at(-1)).toBe('RELEASE')
  })
})
