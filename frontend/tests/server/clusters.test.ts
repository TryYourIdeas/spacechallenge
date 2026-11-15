import { describe, expect, it } from 'vitest'
import { bboxEnvelopes, cellSizeDegrees, parseBbox, parseRowIdx, parseZoom } from '../../server/utils/clusters'

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
