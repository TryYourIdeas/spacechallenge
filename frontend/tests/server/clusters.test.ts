import { describe, expect, it } from 'vitest'
import { bboxEnvelopes, cellSizeDegrees, parseBbox, parseFilterParam, parseRowIdx, parseZoom } from '../../server/utils/clusters'
import { filterPredicate } from '../../server/utils/points'

describe('cellSizeDegrees', () => {
  it('halves with every zoom level', () => {
    expect(cellSizeDegrees(3) / cellSizeDegrees(4)).toBeCloseTo(2, 10)
  })
  it('is about 56 screen pixels wide', () => {
    // At zoom 0 the world is 256 px for 360 degrees.
    expect(cellSizeDegrees(0)).toBeCloseTo((56 * 360) / 256, 10)
  })
})

describe('parseZoom', () => {
  it.each([['0', 0], ['7', 7], ['22', 22], ['7.6', 8]])('accepts %s', (raw, n) => expect(parseZoom(raw)).toBe(n))
  it.each([undefined, '', 'x', '-1', '23', 'NaN', 'Infinity'])('rejects %s', raw => expect(parseZoom(raw)).toBeNull())
})

describe('parseBbox', () => {
  it('parses west,south,east,north', () => {
    expect(parseBbox('-10,-5,20.5,30')).toEqual({ west: -10, south: -5, east: 20.5, north: 30 })
  })
  it('allows west > east (crosses the antimeridian)', () => {
    expect(parseBbox('170,-5,-170,5')).toEqual({ west: 170, south: -5, east: -170, north: 5 })
  })
  it.each([
    undefined, '', '1,2,3', '1,2,3,4,5', 'a,b,c,d', '0,0,0,', '0,10,5,5', '0,-91,5,5', '0,0,5,91', '-181,0,5,5', '0,0,181,5',
    '0,0,Infinity,5',
  ])('rejects %s', raw => expect(parseBbox(raw as string)).toBeNull())
})

describe('bboxEnvelopes', () => {
  it('returns one envelope for an ordinary box', () => {
    expect(bboxEnvelopes({ west: -10, south: -5, east: 20, north: 30 })).toEqual([[-10, -5, 20, 30]])
  })
  it('splits a box that crosses the antimeridian', () => {
    expect(bboxEnvelopes({ west: 170, south: -5, east: -170, north: 5 })).toEqual([[170, -5, 180, 5], [-180, -5, -170, 5]])
  })
})

describe('parseRowIdx', () => {
  it.each([['0', 0], ['42', 42]])('accepts %s', (raw, n) => expect(parseRowIdx(raw)).toBe(n))
  it.each([undefined, '', '-1', '1.5', 'x', '99999999999'])('rejects %s', raw => expect(parseRowIdx(raw)).toBeNull())
})

const L2 = '22222222-2222-4222-8222-222222222222'
const L3 = '33333333-3333-4333-8333-333333333333'

describe('parseFilterParam & filterPredicate', () => {
  it('returns undefined when filter is empty and parses valid filter JSON', () => {
    expect(parseFilterParam(undefined)).toBeUndefined()
    expect(parseFilterParam('')).toBeUndefined()
    const valid = JSON.stringify({
      brazilField: 'c18',
      mode: 'and',
      rules: [
        { kind: 'text', field: 'c2', values: ['Olivine'], hideMissing: true },
        { kind: 'range', field: 'c7', min: 45, max: 52, hideMissing: true },
      ],
    })
    const parsed = parseFilterParam(valid)
    expect(parsed).toBeTruthy()
    const pred = filterPredicate(parsed!, 3)
    expect(pred.sql).toContain('ILIKE')
    expect(pred.params[0]).toBe('c18')
  })

  it('rejects malformed JSON or non-c<N> field keys', () => {
    expect(parseFilterParam('{bad')).toBeNull()
    expect(parseFilterParam(JSON.stringify({ brazilField: 'sql_inject' }))).toBeNull()
    expect(parseFilterParam(JSON.stringify({ rules: [{ kind: 'range', field: 'bad', min: 1 }] }))).toBeNull()
  })
})

describe('cross-layer proximity (near)', () => {
  const near = (o: unknown) => parseFilterParam(JSON.stringify({ near: o }))

  it('parses km and the other layers with their own filters', () => {
    const parsed = near({ km: 5, layers: [
      { layerId: L2, filter: { rules: [{ kind: 'range', field: 'c1', min: 1, max: 2, hideMissing: true }] } },
      { layerId: L3 },
    ] })
    expect(parsed?.near?.km).toBe(5)
    expect(parsed?.near?.layers.map(l => l.layerId)).toEqual([L2, L3])
    expect(parsed?.near?.layers[0]!.filter.rules).toHaveLength(1)
    expect(parsed?.near?.layers[1]!.filter).toEqual({})
  })

  it.each([
    ['zero km', { km: 0, layers: [{ layerId: L2 }] }],
    ['negative km', { km: -1, layers: [{ layerId: L2 }] }],
    ['km too large', { km: 20001, layers: [{ layerId: L2 }] }],
    ['no layers', { km: 5, layers: [] }],
    ['bad layer id', { km: 5, layers: [{ layerId: "x'; DROP TABLE layers;--" }] }],
    ['bad nested field key', { km: 5, layers: [{ layerId: L2, filter: { brazilField: 'nope' } }] }],
    ['not an object', 'x'],
  ])('rejects %s', (_n, value) => expect(near(value)).toBeNull())

  it('rejects a nested near and more than 50 layers', () => {
    const ok = near({ km: 5, layers: [{ layerId: L2, filter: { near: { km: 1, layers: [{ layerId: L3 }] } } }] })
    expect(ok?.near?.layers[0]!.filter).not.toHaveProperty('near')
    const many = Array.from({ length: 51 }, () => ({ layerId: L2 }))
    expect(near({ km: 5, layers: many })).toBeNull()
  })

  it('builds one correlated EXISTS per other layer, numbering nested parameters in order', () => {
    const parsed = near({ km: 5, layers: [
      { layerId: L2, filter: { rules: [{ kind: 'range', field: 'c1', min: 1, max: 2, hideMissing: true }] } },
      { layerId: L3 },
    ] })
    const pred = filterPredicate(parsed!, 3)
    expect(pred.sql.match(/EXISTS/g)).toHaveLength(2)
    expect(pred.sql).toContain('o.layer_id = $4::uuid')
    expect(pred.sql).toContain('ST_DWithin(o.geom::geography, layer_points.geom::geography, $3::float8 * 1000)')
    expect(pred.sql).toContain('o.layer_id = $8::uuid')
    expect(pred.params).toEqual([5, L2, 'c1', 1, 2, L3])
  })
})
