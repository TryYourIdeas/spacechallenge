import { describe, expect, it } from 'vitest'
import { formatValue, isValidCoordinate, parseCatalog, parseClusterResponse, parseLayer, parseLayerIndex, parsePointList, parsePointRow, parseRemoteLayer } from '../app/utils/layers'
import { estimatedProgress, formatWait } from '../app/utils/loading'
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

describe('parseCatalog and remote layers', () => {
  const entry = { key: 'c1', dataType: 'text', filterKind: 'select', valueCount: 5, missingCount: 1, distinctCount: 2, min: null, max: null, options: ['a', 'b'] }

  it('keeps valid entries and drops malformed ones', () => {
    const out = parseCatalog([
      entry,
      { ...entry, key: 'c2', dataType: 'string' }, // not a schema type
      { ...entry, key: 'c3', filterKind: 'slider' },
      { ...entry, key: 'c4', dataType: 'number', filterKind: 'range', min: 1, max: 9, distinctCount: null, options: null },
      { ...entry, key: 'c5', options: [1, 2] }, // options must be strings
      'junk', null,
    ])
    expect(out.map(c => c.key)).toEqual(['c1', 'c4', 'c5'])
    expect(out[0]).toMatchObject({ dataType: 'text', filterKind: 'select', options: ['a', 'b'] })
    expect(out[1]).toMatchObject({ min: 1, max: 9, distinctCount: null })
    expect(out[2]!.options).toBeNull()
  })

  it('returns an empty catalog when the server sent none', () => {
    expect(parseCatalog(undefined)).toEqual([])
    expect(parseCatalog({})).toEqual([])
  })

  it('attaches the catalog to a server layer', () => {
    const layer = parseRemoteLayer(meta, { fields: [{ key: 'c1', label: 'x', type: 'string' }], catalog: [entry], rowCount: 5, skipped: 0, bounds: null })
    expect(layer.catalog).toHaveLength(1)
    expect(parseRemoteLayer(meta, { fields: [], rowCount: 0, bounds: null }).catalog).toEqual([])
  })
})

describe('loading feedback', () => {
  it('is indeterminate until a previous load time is known', () => {
    expect(estimatedProgress(3000, null)).toBeNull()
    expect(estimatedProgress(3000, 0)).toBeNull()
  })
  it('estimates from the last load time and never reaches 100% before the response', () => {
    expect(estimatedProgress(0, 4000)).toBe(0)
    expect(estimatedProgress(1000, 4000)).toBe(0.25)
    expect(estimatedProgress(4000, 4000)).toBe(0.95)
    expect(estimatedProgress(60000, 4000)).toBe(0.95)
    expect(estimatedProgress(-5, 4000)).toBe(0)
  })
  it('formats waits in seconds and minutes', () => {
    expect(formatWait(0)).toBe('0 s')
    expect(formatWait(2400)).toBe('2 s')
    expect(formatWait(59_400)).toBe('59 s')
    expect(formatWait(65_000)).toBe('1 min 05 s')
    expect(formatWait(-10)).toBe('0 s')
  })
})
