import { describe, expect, it } from 'vitest'
import { formatValue, isValidCoordinate, parseLayer, parseLayerIndex } from '../app/utils/layers'
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
