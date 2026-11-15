import { describe, expect, it } from 'vitest'
import { clusterSize, viewportBbox } from '../app/utils/viewport'

describe('viewportBbox', () => {
  it('passes an ordinary view through', () => {
    expect(viewportBbox({ west: -10, south: -5, east: 20, north: 30 })).toBe('-10,-5,20,30')
  })
  it('wraps longitudes that left the primary world copy', () => {
    expect(viewportBbox({ west: 170, south: 0, east: 190, north: 10 })).toBe('170,0,-170,10')
    expect(viewportBbox({ west: -190, south: 0, east: -170, north: 10 })).toBe('170,0,-170,10')
  })
  it('asks for the whole world when the view spans 360 degrees or more', () => {
    expect(viewportBbox({ west: -250, south: 0, east: 250, north: 10 })).toBe('-180,0,180,10')
  })
  it('clamps latitudes', () => {
    expect(viewportBbox({ west: 0, south: -95, east: 10, north: 95 })).toBe('0,-90,10,90')
  })
})

describe('clusterSize', () => {
  it('scales slowly with the count and stays bounded', () => {
    expect(clusterSize(2)).toBeLessThan(clusterSize(2000))
    expect(clusterSize(1e9)).toBeLessThanOrEqual(56)
    expect(clusterSize(2)).toBeGreaterThanOrEqual(30)
  })
})
