import { describe, expect, it } from 'vitest'
import type { Layer } from '../app/types/layers'
import {
  buildServerFilterPayload,
  countGlobalFilters,
  countLayerFilters,
  countriesForContinent,
  defaultGlobalFilter,
  defaultLayerFilter,
  catalogOf,
  detectLayerCapabilities,
  distinctCategoryOptions,
  fieldRangeBounds,
  filtersDiffer,
  filterLayerRows,
  isSentinelOrNull,
  matchesGlobalFilter,
  matchesLayerFilter,
  normalizeRockOrMineral,
} from '../app/utils/filters'

const sampleLayer: Layer = {
  id: 'basalt',
  label: 'Basalts',
  description: '',
  shape: 'circle',
  color: '#00E5FF',
  source: 'basalt.json',
  skipped: 0,
  fields: [
    { key: 'c0', label: 'rock_name', type: 'string' },
    { key: 'c1', label: 'SiO2', type: 'number' },
    { key: 'c2', label: 'TiO2', type: 'number' },
    { key: 'c3', label: 'lunar_chem_temp_sim', type: 'number' },
    { key: 'c4', label: 'south_pole_temp_sim', type: 'number' },
    { key: 'c5', label: 'closest_lunar_group', type: 'string' },
    { key: 'c6', label: 'closest_apollo_mission', type: 'string' },
    { key: 'c7', label: 'brazil', type: 'number' },
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
      c5: 'low-Ti',
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
      c5: 'high-Ti',
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

describe('countriesForContinent', () => {
  it('filters countries by continent', () => {
    const sa = countriesForContinent('south-america')
    expect(sa.some(c => c.id === 'BR')).toBe(true)
    expect(sa.some(c => c.id === 'US')).toBe(false)
  })
})

describe('matchesGlobalFilter', () => {
  it('filters by continent and country (Brazil flag)', () => {
    const g = { ...defaultGlobalFilter(), continent: 'south-america', country: 'BR' }
    expect(countGlobalFilters(g)).toBe(2)
    expect(matchesGlobalFilter(sampleLayer.rows[0]!, sampleLayer.fields, g)).toBe(true)
    expect(matchesGlobalFilter(sampleLayer.rows[1]!, sampleLayer.fields, g)).toBe(false)

    // Proximity is a cross-layer filter: it counts as a global filter but never drops a row here.
    const withProximity = { ...g, proximityKm: 5 }
    expect(countGlobalFilters(withProximity)).toBe(3)
    expect(matchesGlobalFilter(sampleLayer.rows[0]!, sampleLayer.fields, withProximity)).toBe(true)
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
      lunarGroup: 'low-Ti',
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
      lunarGroup: 'low-Ti',
    }
    const kept = filterLayerRows(sampleLayer, defaultGlobalFilter(), fOr)
    expect(kept.map(r => r.id)).toEqual(['rr1', 'uk1'])
  })

  describe('server filter payload', () => {
    const remote = (id: string): Layer => ({ ...sampleLayer, id, rows: [], remote: { rowCount: 10, bounds: null } })
    const A = remote('a'), B = remote('b'), C = remote('c')
    const prox = (km: number | null) => ({ ...defaultGlobalFilter(), proximityKm: km })

    it('carries the region and the layer rules', () => {
      const g = { ...defaultGlobalFilter(), country: 'BR' }
      const f = { ...defaultLayerFilter(), minerals: ['Olivine'], similarityPreset: 'high_chem_temp' }
      const payload = buildServerFilterPayload(sampleLayer, g, f)
      expect(payload).toMatchObject({ brazilField: 'c7', mode: 'and' })
      expect(payload?.rules).toHaveLength(2)
      expect(payload?.near).toBeUndefined()
    })

    it('is null with no filters at all', () => {
      expect(buildServerFilterPayload(A, defaultGlobalFilter())).toBeNull()
    })

    it('adds proximity against each other layer, using that layer’s own filters', () => {
      const bFilter = { ...defaultLayerFilter(), minerals: ['Olivine'] }
      const payload = buildServerFilterPayload(A, prox(5), undefined, [{ layer: B, filter: bFilter }, { layer: C }])
      expect(payload?.near?.km).toBe(5)
      expect(payload?.near?.layers.map(l => l.layerId)).toEqual(['b', 'c'])
      expect(payload?.near?.layers[0]!.filter.rules).toHaveLength(1)
      expect(payload?.near?.layers[1]!.filter).toEqual({})
    })

    it('applies the global region to the other layers as well', () => {
      const g = { ...prox(5), continent: 'south-america' }
      const payload = buildServerFilterPayload(A, g, undefined, [{ layer: B }])
      expect(payload?.boxes).toBeTruthy()
      expect(payload?.near?.layers[0]!.filter.boxes).toEqual(payload?.boxes)
    })

    it('has no proximity without peers or without a radius', () => {
      expect(buildServerFilterPayload(A, prox(5), undefined, [])).toBeNull()
      expect(buildServerFilterPayload(A, prox(null), undefined, [{ layer: B }])).toBeNull()
      expect(buildServerFilterPayload(A, prox(0), undefined, [{ layer: B }])).toBeNull()
    })
  })
})

describe('filtersDiffer', () => {
  const base = () => ({ global: defaultGlobalFilter(), layers: {} as Record<string, ReturnType<typeof defaultLayerFilter>> })
  it('is false for equal filters and ignores the auto-fit preference', () => {
    expect(filtersDiffer(base(), base())).toBe(false)
    const b = base(); b.global.autoFit = false
    expect(filtersDiffer(base(), b)).toBe(false)
  })
  it('detects global and per-layer changes', () => {
    const g = base(); g.global.proximityKm = 5
    expect(filtersDiffer(base(), g)).toBe(true)
    const c = base(); c.global.country = 'BR'
    expect(filtersDiffer(base(), c)).toBe(true)
    const l = base(); l.layers.a = { ...defaultLayerFilter(), minerals: ['Olivine'] }
    expect(filtersDiffer(base(), l)).toBe(true)
  })
})

describe('catalog-driven filters', () => {
  const field = (key: string, label: string, type: 'string' | 'number') => ({ key, label, type })
  const cat = (o: object) => ({ valueCount: 10, missingCount: 0, distinctCount: null, min: null, max: null, options: null, ...o })
  const layer: Layer = {
    id: 'r', label: 'R', description: '', shape: 'circle', color: '#00E5FF', source: '/api/layers/r',
    fields: [field('c0', 'depth', 'number'), field('c1', 'setting', 'string'), field('c2', 'flag', 'string'), field('c3', 'tiny', 'number')],
    rows: [], skipped: 0, remote: { rowCount: 10, bounds: null },
    catalog: [
      cat({ key: 'c0', dataType: 'number', filterKind: 'range', min: 12.3, max: 4801.2 }),
      cat({ key: 'c1', dataType: 'text', filterKind: 'select', distinctCount: 2, options: ['LAND', 'SEA'] }),
      cat({ key: 'c2', dataType: 'boolean', filterKind: 'boolean', distinctCount: 2 }),
      cat({ key: 'c3', dataType: 'number', filterKind: 'range', min: 0.1, max: 0.9 }),
    ],
  }

  it('finds the catalog entry of a field', () => {
    expect(catalogOf(layer, 'c1')?.filterKind).toBe('select')
    expect(catalogOf(layer, 'zz')).toBeUndefined()
  })

  it('uses real numeric bounds instead of the generic -100..5000 default', () => {
    expect(fieldRangeBounds(layer, layer.fields[0]!)).toEqual({ min: 12, max: 4802, step: 1 })
    expect(fieldRangeBounds(layer, layer.fields[3]!)).toEqual({ min: 0, max: 1, step: 0.01 })
    expect(fieldRangeBounds({ ...layer, catalog: [] }, layer.fields[0]!)).toEqual({ min: -100, max: 5000, step: 1 })
  })

  it('offers the select options as combobox values, and false/true for booleans', () => {
    expect(distinctCategoryOptions(layer, layer.fields[1]!)).toEqual(['LAND', 'SEA'])
    expect(distinctCategoryOptions(layer, layer.fields[2]!)).toEqual(['false', 'true'])
    expect(distinctCategoryOptions({ ...layer, catalog: [] }, layer.fields[1]!)).toEqual([])
  })
})
