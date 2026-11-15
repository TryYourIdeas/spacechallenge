import { describe, expect, it } from 'vitest'
import { formatValue, isValidCoordinate, parseClusterResponse, parseLayer, parseLayerIndex, parsePointList, parsePointRow, parseRemoteLayer } from '../app/utils/layers'
import type { LayerMeta } from '../app/types/layers'

const meta: LayerMeta = { id: 'a', label: 'A', description: '', shape: 'circle', color: '#00E5FF', source: 'a.json' }

describe('isValidCoordinate', () => {
  it.each([[0, 0], [90, 180], [-90, -180]])('accepts %s,%s', (a, b) => expect(isValidCoordinate(a, b)).toBe(true))
  it.each([[91, 0], [0, 181], [NaN, 0], ['1', 2], [null, 0]])('rejects %s,%s', (a, b) =>
    expect(isValidCoordinate(a, b)).toBe(false))
})

describe('parseLayerIndex', () => {
  const ok = { id: 'a', label: 'A', color: '#00E5FF', source: 'a.json' }
  it('parses and defaults shape', () => expect(parseLayerIndex({ layers: [ok] })[0]!.shape).toBe('circle'))
  it('rejects duplicate ids', () => expect(() => parseLayerIndex({ layers: [ok, ok] })).toThrow(/Duplicate/))
  it('rejects bad colors', () => expect(() => parseLayerIndex({ layers: [{ ...ok, color: 'red' }] })).toThrow(/#RRGGBB/))
  it('rejects non-objects', () => expect(() => parseLayerIndex({})).toThrow(/layers/))
})

describe('parseLayer', () => {
  const fields = [{ key: 'name', label: 'Name', type: 'string' }]
  it('keeps valid rows and counts skipped ones', () => {
    const layer = parseLayer(meta, {
      fields,
      rows: [
        { id: 'x', latitude: 1, longitude: 2, name: 'ok' },
        { id: 'y', latitude: 200, longitude: 2, name: 'bad lat' },
        { id: 'x', latitude: 3, longitude: 4, name: 'dup' },
        { latitude: 5, longitude: 6, name: 'no id' },
      ],
    })
    expect(layer.rows.map(r => r.id)).toEqual(['x', '3'])
    expect(layer.skipped).toBe(2)
  })
  it('throws on malformed tables', () => expect(() => parseLayer(meta, { rows: [] })).toThrow(/fields/))
})

describe('formatValue', () => {
  it('formats numbers with units', () =>
    expect(formatValue({ key: 'm', label: 'M', type: 'number', unit: 'kg' }, 1200.5)).toBe('1,200.5 kg'))
  it('renders empty for null', () => expect(formatValue({ key: 'm', label: 'M', type: 'string' }, null)).toBe(''))
})

describe('parseLayer with server-side skipped rows', () => {
  it('adds the skipped count reported by the API', () => {
    const layer = parseLayer(meta, { fields: [], rows: [{ id: '0', latitude: 1, longitude: 2 }], skipped: 4 })
    expect(layer.skipped).toBe(4)
  })
})

describe('parseRemoteLayer', () => {
  const raw = {
    fields: [{ key: 'c0', label: 'Site', type: 'string' }, { key: 'c1', label: 'T', type: 'bogus' }],
    skipped: 3, rowCount: 120, bounds: [[-10, -20], [30, 40]],
  }
  it('builds a layer with no rows and the server-side summary', () => {
    const l = parseRemoteLayer(meta, raw)
    expect(l.rows).toEqual([])
    expect(l.skipped).toBe(3)
    expect(l.remote).toEqual({ rowCount: 120, bounds: [[-10, -20], [30, 40]] })
    expect(l.fields.map(f => f.type)).toEqual(['string', 'string'])
  })
  it('accepts an empty layer', () => {
    expect(parseRemoteLayer(meta, { ...raw, rowCount: 0, bounds: null }).remote?.bounds).toBeNull()
  })
  it.each([
    ['fields', { ...raw, fields: undefined }],
    ['rowCount', { ...raw, rowCount: 'x' }],
    ['bounds', { ...raw, bounds: [[1, 2]] }],
    ['bounds', { ...raw, bounds: [[1, 2], [3, NaN]] }],
  ])('rejects a bad %s', (_n, bad) => expect(() => parseRemoteLayer(meta, bad)).toThrow())
})

describe('parseClusterResponse', () => {
  const one = { count: 1, latitude: 1, longitude: 2, bounds: [[1, 2], [1, 2]], id: '7', name: 'x' }
  const many = { count: 40, latitude: 1, longitude: 2, bounds: [[0, 0], [3, 4]] }
  it('parses clusters and single points', () => {
    const r = parseClusterResponse({ items: [one, many], truncated: true })
    expect(r.truncated).toBe(true)
    expect(r.items).toHaveLength(2)
    expect(r.items[0]).toMatchObject({ count: 1, id: '7', name: 'x' })
  })
  it('drops malformed items instead of failing the whole view', () => {
    const r = parseClusterResponse({ items: [one, { count: 2 }, { ...many, latitude: 99 }, { ...one, id: undefined }] })
    expect(r.items).toHaveLength(1)
  })
  it('rejects a body without items', () => expect(() => parseClusterResponse({})).toThrow(/items/))
})

describe('parsePointList / parsePointRow', () => {
  it('keeps valid points and flags truncation', () => {
    const r = parsePointList({ points: [{ id: '1', latitude: 1, longitude: 2, name: 'a' }, { id: '2', latitude: 99, longitude: 0 }, { latitude: 1, longitude: 1 }], truncated: true })
    expect(r).toEqual({ points: [{ id: '1', latitude: 1, longitude: 2, name: 'a' }], truncated: true })
  })
  it('rejects a body without points', () => expect(() => parsePointList({})).toThrow(/points/))
  it('normalises a point row id and rejects bad coordinates', () => {
    expect(parsePointRow({ id: 5, latitude: 1, longitude: 2, c0: 'x' })).toEqual({ id: '5', latitude: 1, longitude: 2, c0: 'x' })
    expect(() => parsePointRow({ id: 5, latitude: 100, longitude: 2 })).toThrow()
  })
})
