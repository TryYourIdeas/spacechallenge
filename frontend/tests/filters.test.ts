import { describe, expect, it } from 'vitest'
import type { Layer } from '../app/types/layers'
import {
  buildServerFilterPayload,
  countGlobalFilters,
  countLayerFilters,
  countriesForContinent,
  defaultGlobalFilter,
  defaultLayerFilter,
  detectLayerCapabilities,
  filterLayerRows,
  haversineKm,
  isSentinelOrNull,
  matchesGlobalFilter,
  matchesLayerFilter,
  normalizeRockOrMineral,
  regionCenter,
} from '../app/utils/filters'

const sampleLayer: Layer = {
  id: 'basalt',
  label: 'Basaltos',
  description: '',
  shape: 'circle',
  color: '#00E5FF',
  source: 'basalt.json',
  skipped: 0,
  fields: [
    { key: 'c0', label: 'rock_name', type: 'string' },
    { key: 'c1', label: 'SiO2', type: 'number' },
    { key: 'c2', label: 'TiO2', type: 'number' },
    { key: 'c3', label: 'sim_lua_quimica_x_temp', type: 'number' },
    { key: 'c4', label: 'sim_temp_polo_sul', type: 'number' },
    { key: 'c5', label: 'grupo_lunar_mais_proximo', type: 'string' },
    { key: 'c6', label: 'missao_amostra_mais_proxima', type: 'string' },
    { key: 'c7', label: 'brasil', type: 'number' },
    { key: 'c8', label: 'tectonic_setting', type: 'string' },
  ],
  rows: [
    {
      id: 'rr1',
      name: 'Pedra Petra',
      latitude: 4.7278,
      longitude: -60.7102,
      c0: 'THOLEIITIC BASALT, OLIVINE [19183]',
      c1: 49.0,
      c2: 1.95,
      c3: 79.1,
      c4: 86.9,
      c5: 'baixo-Ti',
      c6: 'Apollo 15',
      c7: 1,
      c8: 'CONTINENTAL FLOOD BASALT',
    },
    {
      id: 'uk1',
      name: 'Skye',
      latitude: 57.35,
      longitude: -6.2,
      c0: 'ALKALI BASALT [3423]',
      c1: 47.85,
      c2: 3.8,
      c3: 66.5,
      c4: 74.7,
      c5: 'alto-Ti',
      c6: 'Apollo 12',
      c7: 0,
      c8: 'OCEAN ISLAND',
    },
    {
      id: 'missing1',
      name: 'Incomplete',
      latitude: -20.0,
      longitude: -50.0,
      c0: 'GABBRO [111]',
      c1: -999,
      c2: null,
      c3: null,
      c4: 50,
      c5: null,
      c6: null,
      c7: 1,
      c8: 'NA',
    },
  ],
}

describe('normalizeRockOrMineral & isSentinelOrNull', () => {
  it('strips GEOROC citation brackets', () => {
    expect(normalizeRockOrMineral('THOLEIITIC BASALT, OLIVINE [3423]')).toBe('THOLEIITIC BASALT, OLIVINE')
  })

  it('identifies null, empty, NA and -999 as missing/sentinel', () => {
    expect(isSentinelOrNull(null)).toBe(true)
    expect(isSentinelOrNull('')).toBe(true)
    expect(isSentinelOrNull('NA')).toBe(true)
    expect(isSentinelOrNull(-999)).toBe(true)
    expect(isSentinelOrNull('-999')).toBe(true)
    expect(isSentinelOrNull(49.2)).toBe(false)
    expect(isSentinelOrNull('Olivine')).toBe(false)
  })
})

describe('countriesForContinent & haversineKm', () => {
  it('filters countries by continent and resolves region centers', () => {
    const sa = countriesForContinent('south-america')
    expect(sa.some(c => c.id === 'BR')).toBe(true)
    expect(sa.some(c => c.id === 'US')).toBe(false)
    expect(regionCenter('north-america', '')).toEqual({
      lat: 39.828,
      lon: -98.579,
      label: 'North & Central America Center',
    })
    expect(regionCenter('north-america', 'CA')).toEqual({
      lat: 56.13,
      lon: -106.346,
      label: 'Canada Center',
    })
    expect(regionCenter('', '')).toBeNull()
  })

  it('computes distance in km accurately', () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0)
    const d = haversineKm(4.7278, -60.7102, 4.8, -60.8)
    expect(d).toBeGreaterThan(5)
    expect(d).toBeLessThan(20)
  })
})

describe('matchesGlobalFilter', () => {
  it('filters by continent, country (Brazil flag), and radius in km', () => {
    const g = { ...defaultGlobalFilter(), continent: 'south-america', country: 'BR' }
    expect(countGlobalFilters(g)).toBe(2)
    expect(matchesGlobalFilter(sampleLayer.rows[0]!, sampleLayer.fields, g)).toBe(true)
    expect(matchesGlobalFilter(sampleLayer.rows[1]!, sampleLayer.fields, g)).toBe(false)

    const withRadius = { ...g, distanceKm: 100, originLat: 4.7278, originLon: -60.7102 }
    expect(countGlobalFilters(withRadius)).toBe(3)
    expect(matchesGlobalFilter(sampleLayer.rows[0]!, sampleLayer.fields, withRadius)).toBe(true)
    expect(matchesGlobalFilter(sampleLayer.rows[2]!, sampleLayer.fields, withRadius)).toBe(false)

    const withTwoCircles = {
      ...defaultGlobalFilter(),
      circles: [
        { id: 'c1', lat: 4.7278, lon: -60.7102, km: 50, label: 'RR' },
        { id: 'c2', lat: 57.35, lon: -6.2, km: 50, label: 'Skye' },
      ],
    }
    expect(countGlobalFilters(withTwoCircles)).toBe(2)
    expect(matchesGlobalFilter(sampleLayer.rows[0]!, sampleLayer.fields, withTwoCircles)).toBe(true)
    expect(matchesGlobalFilter(sampleLayer.rows[1]!, sampleLayer.fields, withTwoCircles)).toBe(true)
    expect(matchesGlobalFilter(sampleLayer.rows[2]!, sampleLayer.fields, withTwoCircles)).toBe(false)
  })
})

describe('matchesLayerFilter & filterLayerRows', () => {
  it('detects layer capabilities and filters by mineral, similarity preset, oxide range, and missing values', () => {
    const caps = detectLayerCapabilities(sampleLayer)
    expect(caps.mineralField?.key).toBe('c0')
    expect(caps.similarityField?.key).toBe('c3')
    expect(caps.oxideFields.map(f => f.label)).toEqual(['SiO2', 'TiO2'])

    const f = {
      ...defaultLayerFilter(),
      minerals: ['Olivine'],
      similarityPreset: 'high_chem_temp',
      lunarGroup: 'baixo-Ti',
      ranges: { c2: { min: 1.0, max: 2.5 } },
    }
    expect(countLayerFilters(f)).toBe(4)
    const kept = filterLayerRows(sampleLayer, defaultGlobalFilter(), f)
    expect(kept.map(r => r.id)).toEqual(['rr1'])
  })

  it('excludes -999 and null when hideMissing is true, and includes them when false', () => {
    const fHide = { ...defaultLayerFilter(), hideMissing: true, ranges: { c1: { min: 40, max: 55 } } }
    expect(matchesLayerFilter(sampleLayer.rows[2]!, sampleLayer, fHide)).toBe(false)

    const fShow = { ...fHide, hideMissing: false }
    expect(matchesLayerFilter(sampleLayer.rows[2]!, sampleLayer, fShow)).toBe(true)
  })

  it('supports OR mode across multiple layer rules', () => {
    const fOr = {
      ...defaultLayerFilter(),
      mode: 'or' as const,
      minerals: ['Alkali Basalt'],
      lunarGroup: 'baixo-Ti',
    }
    const kept = filterLayerRows(sampleLayer, defaultGlobalFilter(), fOr)
    expect(kept.map(r => r.id)).toEqual(['rr1', 'uk1'])
  })

  it('builds a server filter payload for remote layers', () => {
    const g = { ...defaultGlobalFilter(), country: 'BR', distanceKm: 500, originLat: 4.7, originLon: -60.7 }
    const f = { ...defaultLayerFilter(), minerals: ['Olivine'], similarityPreset: 'high_chem_temp' }
    const payload = buildServerFilterPayload(sampleLayer, g, f)
    expect(payload).toMatchObject({
      brazilField: 'c7',
      distance: { lat: 4.7, lon: -60.7, km: 500 },
      mode: 'and',
    })
    expect(payload?.rules).toHaveLength(2)

    const multi = buildServerFilterPayload(sampleLayer, {
      ...defaultGlobalFilter(),
      circles: [
        { id: 'c1', lat: 4.7, lon: -60.7, km: 200, label: 'A' },
        { id: 'c2', lat: -20, lon: -50, km: 300, label: 'B' },
      ],
    })
    expect(multi?.distances).toEqual([
      { lat: 4.7, lon: -60.7, km: 200 },
      { lat: -20, lon: -50, km: 300 },
    ])
    expect(multi?.distance).toBeUndefined()
  })
})
