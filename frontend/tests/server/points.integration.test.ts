import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../../server/utils/db'
import { clusterPoints, filterPredicate, inBox, layerSummary, listPoints, pointDetail } from '../../server/utils/points'

describe('filterPredicate SQL builder', () => {
  it('returns TRUE when no filter is supplied', () => {
    expect(filterPredicate(undefined, 2)).toEqual({ sql: 'TRUE', params: [] })
  })

  it('builds parameterized SQL for boxes, range, and text rules', () => {
    const res = filterPredicate({
      mode: 'and',
      brazilField: 'c5',
      boxes: [{ west: -75, south: -35, east: -34, north: 6 }],
      rules: [
        { field: 'c0', kind: 'range', min: 45, max: 52, hideMissing: true },
        { field: 'c1', kind: 'text', values: ['THOLEIITIC BASALT'], hideMissing: true },
      ],
    }, 3)
    expect(res.sql).toContain('ST_MakeEnvelope($4, $5, $6, $7, 4326)')
    expect(res.sql).toContain('ILIKE $12')
    expect(res.params).toEqual([
      'c5',
      -75, -35, -34, 6,
      'c0', 45, 52,
      'c1', '%THOLEIITIC BASALT%',
    ])
  })
})

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

  it('filters clusters and point lists by region box and JSONB range rules', async () => {
    const flt = {
      mode: 'and' as const,
      boxes: [{ west: 9, south: 9, east: 11, north: 11 }],
      rules: [{ field: 'c0', kind: 'range' as const, min: 1, max: 2, hideMissing: true }],
    }
    const clustered = await clusterPoints(pool, layer, world, 19, 100, flt)
    expect(clustered.filteredCount).toBe(2)
    expect(clustered.items.map(i => i.name).sort()).toEqual(['a', 'b'])
    const listed = await listPoints(pool, layer, world, 50, flt)
    expect(listed.points.map(p => p.name)).toEqual(['a', 'b'])
  })

  describe('cross-layer proximity (near)', () => {
    const l1 = randomUUID(), l2 = randomUUID(), l3 = randomUUID()
    const names = async (id: string, flt: Parameters<typeof clusterPoints>[5]) =>
      (await clusterPoints(pool, id, world, 22, 100, flt)).items.map(i => i.name).sort()
    const rule = (min: number, max: number) => ({ field: 'c0', kind: 'range' as const, min, max, hideMissing: true })

    beforeAll(async () => {
      // ~1.1 km per 0.01 degree of longitude at the equator.
      await addLayer(l1, [[0, 0, 'p1'], [0, 0.02, 'p2'], [5, 5, 'p3'], [0, 179.995, 'p-east']])
      await addLayer(l2, [[0, 0.01, 'q1'], [40, 40, 'q2'], [0, -179.995, 'q-west']])
      await addLayer(l3, [[5, 5.001, 'r1']])
    })

    it('keeps only points that have a match in the other layer within the radius, in both directions', async () => {
      expect(await names(l1, { near: { km: 5, layers: [{ layerId: l2, filter: {} }] } })).toEqual(['p-east', 'p1', 'p2'])
      expect(await names(l2, { near: { km: 5, layers: [{ layerId: l1, filter: {} }] } })).toEqual(['q-west', 'q1'])
    })

    it('measures real distance: a smaller radius drops the farther point', async () => {
      // p1 is ~1.1 km from q1 and p2 ~1.1 km too; nothing is within 0.5 km.
      expect(await names(l1, { near: { km: 0.5, layers: [{ layerId: l2, filter: {} }] } })).toEqual([])
      expect(await names(l1, { near: { km: 1.5, layers: [{ layerId: l2, filter: {} }] } })).toEqual(['p-east', 'p1', 'p2'])
    })

    it("only counts matches that pass the other layer's own filters", async () => {
      // q1 is row 0 (c0 = 1), q2 is c0 = 2, q-west c0 = 3.
      const onlyQ2 = { near: { km: 5, layers: [{ layerId: l2, filter: { rules: [rule(2, 2)] } }] } }
      expect(await names(l1, onlyQ2)).toEqual([])
      const onlyQ1 = { near: { km: 5, layers: [{ layerId: l2, filter: { rules: [rule(1, 1)] } }] } }
      expect(await names(l1, onlyQ1)).toEqual(['p1', 'p2'])
    })

    it('combines with the layer’s own filters', async () => {
      const f = { rules: [rule(1, 1)], near: { km: 5, layers: [{ layerId: l2, filter: {} }] } }
      expect(await names(l1, f)).toEqual(['p1'])
    })

    it('with several other layers, a point needs a match in every one of them', async () => {
      const both = { near: { km: 5, layers: [{ layerId: l2, filter: {} }, { layerId: l3, filter: {} }] } }
      expect(await names(l1, both)).toEqual([])
      expect(await names(l1, { near: { km: 5, layers: [{ layerId: l3, filter: {} }] } })).toEqual(['p3'])
    })

    it('counts and lists with the proximity applied', async () => {
      const f = { near: { km: 5, layers: [{ layerId: l2, filter: {} }] } }
      const res = await clusterPoints(pool, l1, world, 3, 100, f)
      expect(res.filteredCount).toBe(3)
      const listed = await listPoints(pool, l1, world, 50, f)
      expect(listed.points.map(p => p.name).sort()).toEqual(['p-east', 'p1', 'p2'])
    })

    it('uses the geography index for the proximity lookup', async () => {
      const pred = filterPredicate({ near: { km: 5, layers: [{ layerId: l2, filter: {} }] } }, 2)
      await pool.query('ANALYZE layer_points')
      await pool.query('SET enable_seqscan = off')
      const { rows } = await pool.query(
        `EXPLAIN SELECT row_idx FROM layer_points WHERE layer_id = $1 AND ${pred.sql}`, [l1, ...pred.params])
      await pool.query('RESET enable_seqscan')
      expect(rows.map(r => r['QUERY PLAN']).join('\n')).toContain('layer_points_geog_idx')
    })
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
