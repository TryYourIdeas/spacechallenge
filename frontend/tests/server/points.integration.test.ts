import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../../server/utils/db'
import { clusterPoints, inBox, layerSummary, listPoints, pointDetail } from '../../server/utils/points'

// Runs against a real PostgreSQL with PostGIS. Point TEST_DATABASE_URL at any database the
// role may CREATE DATABASE in (the Compose `app` role can); a scratch database is created and dropped.
const adminUrl = process.env.TEST_DATABASE_URL
const migrations = fileURLToPath(new URL('../../../backend/services/database/migrations', import.meta.url))

describe.skipIf(!adminUrl)('PostGIS clustering (integration)', () => {
  const dbName = `test_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  let admin: pg.Pool
  let pool: pg.Pool
  const layer = randomUUID()
  const other = randomUUID()
  const world = { west: -180, south: -90, east: 180, north: 90 }

  async function addLayer(id: string, points: [number, number, string | null][]) {
    await pool.query(`INSERT INTO layers (id, label, color, shape, fields, row_count)
      VALUES ($1, 'T', '#00E5FF', 'circle', '[]', $2)`, [id, points.length])
    await pool.query(
      `INSERT INTO layer_points (layer_id, row_idx, latitude, longitude, name, data)
       SELECT $1, i - 1, p.lat, p.lon, p.name, jsonb_build_object('c0', i)
       FROM unnest($2::float8[], $3::float8[], $4::text[]) WITH ORDINALITY AS p(lat, lon, name, i)`,
      [id, points.map(p => p[0]), points.map(p => p[1]), points.map(p => p[2])])
  }

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminUrl, max: 1 })
    await admin.query(`CREATE DATABASE ${dbName}`)
    const url = new URL(adminUrl!)
    url.pathname = `/${dbName}`
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 })
    await migrate(pool, migrations)
    await addLayer(layer, [
      [10, 10, 'a'], [10.001, 10.001, 'b'], [10.002, 10, 'c'], // three close points
      [20, -50, 'far'],
      [30, 30, 'twin-1'], [30, 30, 'twin-2'], // identical coordinates
      [0, 179.9, 'east-edge'], [0, -179.9, 'west-edge'], // either side of the antimeridian
    ])
    await addLayer(other, [[10, 10, 'other-layer']])
  })

  afterAll(async () => {
    await pool?.end()
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName}`)
    await admin?.end()
  })

  it('migration 0003 backfills geometry from latitude/longitude', async () => {
    const { rows: [r] } = await pool.query(
      'SELECT ST_X(geom) AS x, ST_Y(geom) AS y, ST_SRID(geom) AS srid FROM layer_points WHERE layer_id = $1 AND row_idx = 3', [layer])
    expect([r.x, r.y, r.srid]).toEqual([-50, 20, 4326])
  })

  it('groups nearby points when zoomed out and keeps others apart', async () => {
    const { items, truncated } = await clusterPoints(pool, layer, world, 3)
    expect(truncated).toBe(false)
    expect(items.reduce((n, i) => n + i.count, 0)).toBe(8)
    expect(items[0]!.count).toBeGreaterThanOrEqual(3)
    const far = items.find(i => i.name === 'far')
    expect(far).toMatchObject({ count: 1, id: '3', latitude: 20, longitude: -50 })
  })

  it('separates the close points when zoomed in', async () => {
    const box = { west: 9.9, south: 9.9, east: 10.1, north: 10.1 }
    const { items } = await clusterPoints(pool, layer, box, 19)
    expect(items.map(i => i.name).sort()).toEqual(['a', 'b', 'c'])
    expect(items.every(i => i.count === 1)).toBe(true)
  })

  it('returns only points inside the viewport, and only from the requested layer', async () => {
    const { items } = await clusterPoints(pool, layer, { west: 9, south: 9, east: 11, north: 11 }, 19)
    expect(items.some(i => i.name === 'other-layer' || i.name === 'far')).toBe(false)
    const empty = await clusterPoints(pool, layer, { west: 100, south: 50, east: 101, north: 51 }, 5)
    expect(empty).toEqual({ items: [], truncated: false })
  })

  it('finds points across the antimeridian', async () => {
    const { items } = await clusterPoints(pool, layer, { west: 170, south: -5, east: -170, north: 5 }, 19)
    expect(items.map(i => i.name).sort()).toEqual(['east-edge', 'west-edge'])
  })

  it('reports a cluster of identical coordinates that zooming cannot split, and lists its members', async () => {
    const box = { west: 29.9, south: 29.9, east: 30.1, north: 30.1 }
    const { items } = await clusterPoints(pool, layer, box, 22)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ count: 2, bounds: [[30, 30], [30, 30]] })
    const { points, truncated } = await listPoints(pool, layer, box)
    expect(points.map(p => p.name)).toEqual(['twin-1', 'twin-2'])
    expect(truncated).toBe(false)
  })

  it('caps the number of items and flags truncation', async () => {
    const { items, truncated } = await clusterPoints(pool, layer, world, 19, 2)
    expect(items).toHaveLength(2)
    expect(truncated).toBe(true)
  })

  it('returns layer metadata with its extent, and detail for one point', async () => {
    const s = await layerSummary(pool, layer)
    expect(s).toMatchObject({ rowCount: 8, skipped: 0, bounds: [[0, -179.9], [30, 179.9]] })
    expect(await layerSummary(pool, randomUUID())).toBeUndefined()
    expect(await pointDetail(pool, layer, 3)).toEqual({ id: '3', latitude: 20, longitude: -50, name: 'far', c0: 4 })
    expect(await pointDetail(pool, layer, 999)).toBeUndefined()
  })

  it('reads a viewport through the GiST index on a larger layer', async () => {
    const big = randomUUID()
    await pool.query(`INSERT INTO layers (id, label, color, shape, fields, row_count)
      VALUES ($1, 'Big', '#00E5FF', 'circle', '[]', 50000)`, [big])
    await pool.query(
      `INSERT INTO layer_points (layer_id, row_idx, latitude, longitude, data)
       SELECT $1, i, (i % 180) - 89.5, ((i * 7919) % 360) - 179.5, '{}'::jsonb FROM generate_series(1, 50000) AS i`, [big])
    await pool.query('ANALYZE layer_points')
    const box = inBox({ west: 10, south: 10, east: 12, north: 12 }, 2)
    const { rows } = await pool.query(
      `EXPLAIN SELECT row_idx FROM layer_points WHERE layer_id = $1 AND ${box.sql}`, [big, ...box.params])
    expect(rows.map(r => r['QUERY PLAN']).join('\n')).toContain('layer_points_geom_idx')
  })
})
