import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyze } from '../../server/utils/csv'
import { convertGeojsonFile, geojsonToCsv } from '../../server/utils/geojson'

const fc = (...features: unknown[]) => ({ type: 'FeatureCollection', features })
const pt = (lon: number, lat: number, properties: unknown = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties })

describe('geojsonToCsv', () => {
  it('writes lat and lon first, then property columns, in lon/lat -> lat/lon order', () => {
    const r = geojsonToCsv(fc(pt(-47.9, -15.8, { name: 'Brasilia', n: 3 })))
    expect(r.csv).toBe('lat,lon,name,n\n-15.8,-47.9,Brasilia,3\n')
    expect(r).toMatchObject({ rows: 1, skipped: 0 })
  })

  it('unions property keys across features and leaves gaps empty', () => {
    const r = geojsonToCsv(fc(pt(1, 2, { a: 1 }), pt(3, 4, { b: 'x' })))
    expect(r.csv).toBe('lat,lon,a,b\n2,1,1,\n4,3,,x\n')
  })

  it('quotes commas, quotes and newlines, and stringifies nested values', () => {
    const r = geojsonToCsv(fc(pt(0, 0, { t: 'a,"b"\nc', o: { k: 1 }, z: null })))
    expect(r.csv).toBe('lat,lon,t,o,z\n0,0,"a,""b""\nc","{""k"":1}",\n')
  })

  it('renames properties that would shadow lat/lon', () => {
    const r = geojsonToCsv(fc(pt(1, 2, { lat: 'x', Longitude: 'y' })))
    expect(r.csv.split('\n')[0]).toBe('lat,lon,prop_lat,prop_Longitude')
  })

  it('expands MultiPoint into one row per point', () => {
    const r = geojsonToCsv(fc({ type: 'Feature', properties: { id: 7 }, geometry: { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] } }))
    expect(r.csv).toBe('lat,lon,id\n2,1,7\n4,3,7\n')
    expect(r.rows).toBe(2)
  })

  it('uses the mean of the distinct vertices for lines and polygons', () => {
    const poly = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] } }
    const line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [2, 2]] } }
    expect(geojsonToCsv(fc(poly, line)).csv).toBe('lat,lon\n2,2\n1,1\n')
  })

  it('accepts a bare Feature, a bare geometry and GeometryCollection', () => {
    expect(geojsonToCsv(pt(1, 2)).csv).toBe('lat,lon\n2,1\n')
    expect(geojsonToCsv({ type: 'Point', coordinates: [1, 2] }).rows).toBe(1)
    const gc = { type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }, { type: 'Point', coordinates: [3, 4] }] } }
    expect(geojsonToCsv(gc).rows).toBe(2)
  })

  it('ignores a z coordinate', () => {
    expect(geojsonToCsv({ type: 'Point', coordinates: [1, 2, 300] }).csv).toBe('lat,lon\n2,1\n')
  })

  it('skips and counts features with no or unusable geometry', () => {
    const r = geojsonToCsv(fc(pt(1, 2), { type: 'Feature', geometry: null, properties: {} }, pt(500, 2), { type: 'Feature', geometry: { type: 'Point', coordinates: [] }, properties: {} }))
    expect(r).toMatchObject({ rows: 1, skipped: 3 })
  })

  it('rejects input that is not GeoJSON or has nothing usable', () => {
    expect(() => geojsonToCsv({ hello: 1 })).toThrow(/GeoJSON/)
    expect(() => geojsonToCsv(null)).toThrow(/GeoJSON/)
    expect(() => geojsonToCsv(fc())).toThrow(/no usable/i)
    expect(() => geojsonToCsv(fc({ type: 'Feature', geometry: null, properties: {} }))).toThrow(/no usable/i)
  })
})

describe('convertGeojsonFile', () => {
  let dir: string
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'gj-')) })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('writes <name>.csv next to the input and the result imports cleanly', async () => {
    const src = join(dir, 'sites.geojson')
    await writeFile(src, JSON.stringify(fc(pt(-47, -15, { name: 'A' }), pt(10, 20, { name: 'B' }))))
    const r = await convertGeojsonFile(src)
    expect(r.outPath).toBe(join(dir, 'sites.csv'))
    expect((await readFile(r.outPath, 'utf8')).startsWith('lat,lon,name\n')).toBe(true)
    expect(await analyze(r.outPath)).toMatchObject({ valid: 2, skipped: 0 })
  })

  it('honours an explicit output path, refuses to overwrite, rejects invalid JSON', async () => {
    const src = join(dir, 'a.json'); await writeFile(src, JSON.stringify(fc(pt(1, 2))))
    const out = join(dir, 'custom.csv')
    await convertGeojsonFile(src, out)
    await expect(convertGeojsonFile(src, out)).rejects.toThrow(/already exists/)
    const bad = join(dir, 'bad.geojson'); await writeFile(bad, '{nope')
    await expect(convertGeojsonFile(bad)).rejects.toThrow(/not valid JSON/i)
    await expect(convertGeojsonFile(join(dir, 'missing.geojson'))).rejects.toThrow(/not found/i)
  })
})
