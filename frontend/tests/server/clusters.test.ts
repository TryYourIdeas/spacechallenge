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

describe('parseFilterParam & filterPredicate', () => {
  it('returns undefined when filter is empty and parses valid filter JSON', () => {
    expect(parseFilterParam(undefined)).toBeUndefined()
    expect(parseFilterParam('')).toBeUndefined()
    const valid = JSON.stringify({
      brazilField: 'c18',
      distance: { lat: 4.7, lon: -60.7, km: 500 },
      mode: 'and',
      rules: [
        { kind: 'text', field: 'c2', values: ['Olivine'], hideMissing: true },
        { kind: 'range', field: 'c7', min: 45, max: 52, hideMissing: true },
      ],
    })
    const parsed = parseFilterParam(valid)
    expect(parsed).toBeTruthy()
    const pred = filterPredicate(parsed!, 3)
    expect(pred.sql).toContain('ST_DWithin')
    expect(pred.sql).toContain('ILIKE')
    expect(pred.params[0]).toBe('c18')
  })

  it('rejects malformed JSON, non-c<N> field keys, or out-of-range coordinates', () => {
    expect(parseFilterParam('{bad')).toBeNull()
    expect(parseFilterParam(JSON.stringify({ brazilField: 'sql_inject' }))).toBeNull()
    expect(parseFilterParam(JSON.stringify({ distance: { lat: 95, lon: 0, km: 100 } }))).toBeNull()
    expect(parseFilterParam(JSON.stringify({ rules: [{ kind: 'range', field: 'bad', min: 1 }] }))).toBeNull()
  })
})
