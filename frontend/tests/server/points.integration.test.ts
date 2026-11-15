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

  describe('schema and data catalog (rebuild_layer_catalog)', () => {
    const cat = randomUUID()
    const fields = [
      { key: 'c0', label: 'num', type: 'number' },
      { key: 'c1', label: 'few', type: 'string' },
      { key: 'c2', label: 'many', type: 'string' },
      { key: 'c3', label: 'flag', type: 'string' },
      { key: 'c4', label: 'day', type: 'string' },
      { key: 'c5', label: 'mixed_day', type: 'string' },
      { key: 'c6', label: 'all_missing', type: 'number' },
      { key: 'c7', label: 'twenty', type: 'string' },
      { key: 'c8', label: 'never_in_data', type: 'string' },
    ]
    const FEW = ['red', 'green', 'blue']
    const rowsN = 40
    const summary = async () => (await layerSummary(pool, cat))!.catalog
    const by = (c: Awaited<ReturnType<typeof summary>>, key: string) => c.find(x => x.key === key)!

    beforeAll(async () => {
      await pool.query(`INSERT INTO layers (id, label, color, shape, fields, row_count)
        VALUES ($1, 'Catalog', '#00E5FF', 'circle', $2, $3)`, [cat, JSON.stringify(fields), rowsN])
      await pool.query(
        `INSERT INTO layer_points (layer_id, row_idx, latitude, longitude, data)
         SELECT $1, i, 0, 0, jsonb_build_object(
           'c0', CASE WHEN i % 10 = 0 THEN to_jsonb(-999) WHEN i % 7 = 0 THEN 'null'::jsonb ELSE to_jsonb(i * 1.5) END,
           'c1', CASE WHEN i % 8 = 0 THEN to_jsonb('NA'::text) WHEN i % 9 = 0 THEN to_jsonb(''::text) ELSE to_jsonb((ARRAY['red','green','blue'])[1 + i % 3]) END,
           'c2', to_jsonb('v' || i),
           'c3', to_jsonb((ARRAY['true','FALSE'])[1 + i % 2]),
           'c4', to_jsonb(CASE WHEN i % 2 = 0 THEN '2026-01-15' ELSE '2026-03-02T10:30:00Z' END),
           'c5', to_jsonb(CASE WHEN i = 5 THEN 'soon' ELSE '2026-01-15' END),
           'c6', to_jsonb(-999),
           'c7', to_jsonb('t' || (i % 20))
         ) FROM generate_series(1, $2::int) AS i`, [cat, rowsN])
      await pool.query('SELECT rebuild_layer_catalog($1)', [cat])
    })

    it('classifies each field as number, boolean, text or date, in column order', async () => {
      const c = await summary()
      expect(c.map(x => x.key)).toEqual(fields.map(f => f.key))
      expect(c.map(x => x.dataType)).toEqual(
        ['number', 'text', 'text', 'boolean', 'date', 'text', 'number', 'text', 'text'])
      expect(c.every(x => ['number', 'boolean', 'text', 'date'].includes(x.dataType))).toBe(true)
    })

    it('gives numeric fields a range from present values only, ignoring null and -999', async () => {
      const n = by(await summary(), 'c0')
      expect(n.filterKind).toBe('range')
      expect(n.min).toBe(1.5)
      expect(n.max).toBe(58.5) // i = 40 is -999, so 39 * 1.5 is the largest present value
      expect(n.distinctCount).toBeNull()
      expect(n.valueCount + n.missingCount).toBe(rowsN)
      expect(n.missingCount).toBe(4 + 5) // i % 10 = 0 (4 rows) and i % 7 = 0 not already counted (5 rows)
      expect(n.options).toBeNull()
    })

    it('marks text with fewer than 20 distinct values as select, excluding missing markers', async () => {
      const f = by(await summary(), 'c1')
      expect(f.filterKind).toBe('select')
      expect(f.options).toEqual([...FEW].sort())
      expect(f.distinctCount).toBe(3)
      expect(f.missingCount).toBeGreaterThan(0)
    })

    it('treats 19 distinct values as select and 20 as free text', async () => {
      const t = by(await summary(), 'c7')
      expect(t.distinctCount).toBe(20)
      expect(t.filterKind).toBe('text')
      expect(t.options).toBeNull()
      await pool.query(`DELETE FROM layer_points WHERE layer_id = $1 AND data ->> 'c7' = 't0'`, [cat])
      await pool.query('SELECT rebuild_layer_catalog($1)', [cat])
      const after = by(await summary(), 'c7')
      expect(after.distinctCount).toBe(19)
      expect(after.filterKind).toBe('select')
      expect(after.options).toHaveLength(19)
    })

    it('counts many distinct text values without options', async () => {
      const m = by(await summary(), 'c2')
      expect(m.filterKind).toBe('text')
      expect(m.distinctCount).toBe(rowsN - 2) // two rows were removed above (t0 rows: i = 20, 40)
      expect(m.options).toBeNull()
    })

    it('detects booleans (true/false text, any case) and ISO dates', async () => {
      const c = await summary()
      expect(by(c, 'c3')).toMatchObject({ dataType: 'boolean', filterKind: 'boolean', options: null })
      expect(by(c, 'c4')).toMatchObject({ dataType: 'date', filterKind: 'date_range', min: '2026-01-15', max: '2026-03-02T10:30:00Z' })
    })

    it('one value that is not a date makes the whole field text', async () => {
      expect(by(await summary(), 'c5')).toMatchObject({ dataType: 'text', filterKind: 'select', distinctCount: 2 })
    })

    it('falls back to the declared type when a field has no present values', async () => {
      const c = await summary()
      expect(by(c, 'c6')).toMatchObject({ dataType: 'number', filterKind: 'range', valueCount: 0, min: null, max: null })
      expect(by(c, 'c8')).toMatchObject({ dataType: 'text', filterKind: 'text', valueCount: 0, distinctCount: 0 })
    })

    it('is idempotent and cascades when the layer is deleted', async () => {
      const before = JSON.stringify(await summary())
      await pool.query('SELECT rebuild_layer_catalog($1)', [cat])
      expect(JSON.stringify(await summary())).toBe(before)
      await pool.query('DELETE FROM layers WHERE id = $1', [cat])
      const { rows: [r] } = await pool.query(
        `SELECT (SELECT count(*) FROM layer_schema WHERE layer_id = $1)::int AS s,
                (SELECT count(*) FROM layer_catalog WHERE layer_id = $1)::int AS c`, [cat])
      expect(r).toEqual({ s: 0, c: 0 })
    })

    it('rejects values outside the allowed types and kinds', async () => {
      const l = randomUUID()
      await pool.query(`INSERT INTO layers (id, label, color, shape, fields, row_count)
        VALUES ($1, 'C', '#00E5FF', 'circle', '[]', 0)`, [l])
      await expect(pool.query(
        `INSERT INTO layer_schema (layer_id, field_key, position, label, data_type) VALUES ($1, 'c0', 0, 'x', 'string')`, [l]),
      ).rejects.toThrow(/data_type/)
      await pool.query(`INSERT INTO layer_schema VALUES ($1, 'c0', 0, 'x', 'text')`, [l])
      await expect(pool.query(
        `INSERT INTO layer_catalog (layer_id, field_key, value_count, missing_count, filter_kind, options)
         VALUES ($1, 'c0', 1, 0, 'select', NULL)`, [l]),
      ).rejects.toThrow(/options_shape/)
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
