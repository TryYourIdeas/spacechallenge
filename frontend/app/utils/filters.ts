import type { GlobalFilter, LatLngBoundsTuple, Layer, LayerField, LayerFilter, LayerRow, NumericRangeFilter, RadiusCircle } from '../types/layers'

export interface GeoEnvelope {
  west: number
  south: number
  east: number
  north: number
}

export interface ContinentDef {
  id: string
  label: string
  center: [number, number]
  boxes: GeoEnvelope[]
}

export interface CountryDef {
  id: string
  label: string
  continent: string
  center: [number, number]
  boxes: GeoEnvelope[]
  keywords: string[]
}

export const CONTINENTS: ContinentDef[] = [
  { id: 'south-america', label: 'South America', center: [-14.235, -56.0], boxes: [{ west: -82, south: -56, east: -34, north: 13 }] },
  { id: 'north-america', label: 'North & Central America', center: [39.828, -98.579], boxes: [{ west: -168, south: 7, east: -52, north: 84 }] },
  { id: 'europe', label: 'Europe', center: [50.11, 10.45], boxes: [{ west: -25, south: 35, east: 60, north: 72 }] },
  { id: 'africa', label: 'Africa', center: [1.65, 21.09], boxes: [{ west: -18, south: -35, east: 52, north: 37.5 }] },
  { id: 'asia', label: 'Asia', center: [34.047, 100.619], boxes: [{ west: 26, south: -11, east: 180, north: 78 }] },
  { id: 'oceania', label: 'Oceania', center: [-25.274, 133.775], boxes: [{ west: 110, south: -50, east: 180, north: 0 }] },
  { id: 'antarctica', label: 'Antarctica', center: [-75.25, 0.0], boxes: [{ west: -180, south: -90, east: 180, north: -60 }] },
]

export const COUNTRIES: CountryDef[] = [
  { id: 'BR', label: 'Brazil', continent: 'south-america', center: [-14.235, -51.925], boxes: [{ west: -74.0, south: -33.8, east: -34.0, north: 5.4 }], keywords: ['brazil', 'brasil', 'parana', 'serra geral'] },
  { id: 'AR', label: 'Argentina', continent: 'south-america', center: [-38.416, -63.616], boxes: [{ west: -73.6, south: -55.1, east: -53.6, north: -21.8 }], keywords: ['argentina', 'campo del cielo'] },
  { id: 'GF', label: 'French Guiana (France)', continent: 'south-america', center: [4.0, -53.0], boxes: [{ west: -54.6, south: 2.1, east: -51.6, north: 5.8 }], keywords: ['french guiana', 'kourou', 'guiana'] },
  { id: 'CL', label: 'Chile', continent: 'south-america', center: [-35.675, -71.543], boxes: [{ west: -75.6, south: -55.9, east: -66.4, north: -17.5 }], keywords: ['chile', 'atacama'] },
  { id: 'CO', label: 'Colombia / Costa Rica', continent: 'south-america', center: [4.57, -74.297], boxes: [{ west: -86.0, south: -4.2, east: -66.9, north: 12.5 }], keywords: ['colombia', 'costa rica', 'nicoya'] },
  { id: 'US', label: 'United States', continent: 'north-america', center: [39.828, -98.579], boxes: [{ west: -125.0, south: 24.5, east: -66.9, north: 49.5 }, { west: -170.0, south: 51.0, east: -129.9, north: 71.5 }, { west: -161.0, south: 18.5, east: -154.5, north: 22.5 }], keywords: ['united states', 'usa', 'hawaii', 'alaska', 'arizona', 'california', 'texas', 'florida'] },
  { id: 'CA', label: 'Canada', continent: 'north-america', center: [56.13, -106.346], boxes: [{ west: -141.0, south: 41.7, east: -52.6, north: 83.1 }], keywords: ['canada', 'devon island'] },
  { id: 'MX', label: 'Mexico', continent: 'north-america', center: [23.634, -102.552], boxes: [{ west: -117.1, south: 14.5, east: -86.7, north: 32.7 }], keywords: ['mexico', 'allende'] },
  { id: 'ES', label: 'Spain', continent: 'europe', center: [40.463, -3.749], boxes: [{ west: -18.2, south: 27.6, east: 4.3, north: 43.8 }], keywords: ['spain', 'madrid', 'lanzarote'] },
  { id: 'SE', label: 'Sweden', continent: 'europe', center: [60.128, 18.643], boxes: [{ west: 11.1, south: 55.3, east: 24.2, north: 69.1 }], keywords: ['sweden', 'kiruna'] },
  { id: 'FI', label: 'Finland', continent: 'europe', center: [61.924, 25.748], boxes: [{ west: 19.5, south: 59.8, east: 31.6, north: 70.1 }], keywords: ['finland', 'karelian', 'kuhmo'] },
  { id: 'IS', label: 'Iceland', continent: 'europe', center: [64.963, -19.02], boxes: [{ west: -24.6, south: 63.3, east: -13.5, north: 66.6 }], keywords: ['iceland'] },
  { id: 'GB', label: 'United Kingdom', continent: 'europe', center: [55.378, -3.436], boxes: [{ west: -8.6, south: 49.9, east: 1.8, north: 60.9 }], keywords: ['united kingdom', 'british', 'scotland'] },
  { id: 'NA', label: 'Namibia', continent: 'africa', center: [-22.957, 18.49], boxes: [{ west: 11.7, south: -29.0, east: 25.3, north: -17.0 }], keywords: ['namibia', 'hoba', 'etendeka'] },
  { id: 'KE', label: 'Kenya', continent: 'africa', center: [-0.023, 37.906], boxes: [{ west: 33.9, south: -4.7, east: 41.9, north: 5.0 }], keywords: ['kenya', 'malindi'] },
  { id: 'ZA', label: 'South Africa', continent: 'africa', center: [-30.559, 22.937], boxes: [{ west: 16.4, south: -34.8, east: 32.9, north: -22.1 }], keywords: ['south africa', 'karoo'] },
  { id: 'KZ', label: 'Kazakhstan', continent: 'asia', center: [48.019, 66.923], boxes: [{ west: 46.5, south: 40.6, east: 87.3, north: 55.4 }], keywords: ['kazakhstan', 'baikonur'] },
  { id: 'CN', label: 'China', continent: 'asia', center: [35.861, 104.195], boxes: [{ west: 73.5, south: 18.2, east: 134.8, north: 53.6 }], keywords: ['china', 'jiuquan', 'emeishan'] },
  { id: 'IN', label: 'India', continent: 'asia', center: [20.593, 78.962], boxes: [{ west: 68.1, south: 6.7, east: 97.4, north: 35.5 }], keywords: ['india', 'sriharikota', 'deccan'] },
  { id: 'JP', label: 'Japan', continent: 'asia', center: [36.204, 138.252], boxes: [{ west: 122.9, south: 24.2, east: 145.8, north: 45.5 }], keywords: ['japan', 'tanegashima'] },
  { id: 'RU', label: 'Russia', continent: 'asia', center: [61.524, 105.318], boxes: [{ west: 27.0, south: 41.2, east: 180.0, north: 81.9 }], keywords: ['russia', 'chelyabinsk', 'siberian'] },
  { id: 'AU', label: 'Australia', continent: 'oceania', center: [-25.274, 133.775], boxes: [{ west: 112.9, south: -43.7, east: 153.6, north: -10.7 }], keywords: ['australia', 'canberra', 'new norcia', 'murchison'] },
  { id: 'AQ', label: 'Antarctica', continent: 'antarctica', center: [-75.25, 0.0], boxes: [{ west: -180.0, south: -90.0, east: 180.0, north: -60.0 }], keywords: ['antarctica', 'antarctic', 'mcmurdo'] },
]

export const OXIDE_DEFAULTS: Record<string, { min: number; max: number; step: number }> = {
  sio2: { min: 35, max: 60, step: 0.5 },
  tio2: { min: 0, max: 15, step: 0.1 },
  al2o3: { min: 0, max: 30, step: 0.5 },
  feot: { min: 0, max: 35, step: 0.5 },
  mgo: { min: 0, max: 40, step: 0.5 },
  cao: { min: 0, max: 25, step: 0.5 },
  na2o: { min: 0, max: 12, step: 0.1 },
  k2o: { min: 0, max: 10, step: 0.1 },
  p2o5: { min: 0, max: 5, step: 0.05 },
}

export const COMMON_BASALT_MINERALS = [
  'Basalt',
  'Tholeiitic Basalt',
  'Alkali Basalt',
  'Olivine',
  'Plagioclase',
  'Augite',
  'Picrite',
  'Gabbro',
  'Granulite',
  'Cumulate',
]

export const LUNAR_GROUPS = ['baixo-Ti', 'alto-Ti', 'alto-Al', 'KREEP']
export const LUNAR_GROUP_LABELS: Record<string, string> = {
  'baixo-Ti': 'Low-Ti (baixo-Ti)',
  'alto-Ti': 'High-Ti (alto-Ti)',
  'alto-Al': 'High-Al (alto-Al)',
  KREEP: 'KREEP',
}
export const APOLLO_MISSIONS = ['Apollo 11', 'Apollo 12', 'Apollo 14', 'Apollo 15', 'Apollo 16', 'Apollo 17']

export interface SimilarityPresetDef {
  id: string
  label: string
}

export const SIMILARITY_PRESETS: SimilarityPresetDef[] = [
  { id: 'high_chem_temp', label: 'Chem×Temp ≥ 70%' },
  { id: 'high_chem', label: 'Chem. Sim. ≥ 70%' },
  { id: 'south_pole', label: 'South Pole ≥ 80%' },
  { id: 'kreep', label: 'KREEP Analog' },
  { id: 'brazil_only', label: 'Brazil Only' },
]

export function countriesForContinent(continentId: string): CountryDef[] {
  if (!continentId) return COUNTRIES
  return COUNTRIES.filter(c => c.continent === continentId)
}

export function regionCenter(continentId: string, countryId: string): { lat: number; lon: number; label: string } | null {
  if (countryId) {
    const c = COUNTRIES.find(x => x.id === countryId)
    if (c) return { lat: c.center[0], lon: c.center[1], label: `${c.label} Center` }
  }
  if (continentId) {
    const cont = CONTINENTS.find(x => x.id === continentId)
    if (cont) return { lat: cont.center[0], lon: cont.center[1], label: `${cont.label} Center` }
  }
  return null
}

export function defaultGlobalFilter(): GlobalFilter {
  return {
    continent: '',
    country: '',
    distanceKm: null,
    originLat: null,
    originLon: null,
    originLabel: '',
    circles: [],
    syncRegionCircle: true,
    autoFit: true,
  }
}

export function activeCircles(g: GlobalFilter): RadiusCircle[] {
  if (g.circles && g.circles.length > 0) {
    return g.circles.filter(c => c.km > 0 && Number.isFinite(c.lat) && Number.isFinite(c.lon))
  }
  if (g.distanceKm !== null && g.distanceKm > 0 && g.originLat !== null && g.originLon !== null) {
    return [{
      id: 'primary',
      lat: g.originLat,
      lon: g.originLon,
      km: g.distanceKm,
      label: g.originLabel || `${g.originLat.toFixed(2)}°, ${g.originLon.toFixed(2)}°`,
    }]
  }
  return []
}

export function defaultLayerFilter(): LayerFilter {
  return {
    mode: 'and',
    hideMissing: true,
    minerals: [],
    similarityPreset: '',
    similarityRange: { min: null, max: null },
    lunarGroup: '',
    apolloMission: '',
    ranges: {},
    categories: {},
  }
}

/** Strips citation brackets like `[13590]` and normalizes rock/mineral strings. */
export function normalizeRockOrMineral(raw: string): string {
  return raw.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim()
}

export function isSentinelOrNull(val: unknown): boolean {
  if (val === null || val === undefined || val === '') return true
  if (typeof val === 'number') return !Number.isFinite(val) || val === -999
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase()
    return s === '' || s === 'na' || s === 'null' || s === '-999' || s === '-999.0'
  }
  return false
}

export function countGlobalFilters(g: GlobalFilter): number {
  let n = 0
  if (g.continent) n++
  if (g.country) n++
  n += activeCircles(g).length
  return n
}

export function countLayerFilters(f?: LayerFilter): number {
  if (!f) return 0
  let n = 0
  if (f.minerals.length > 0) n++
  if (f.similarityPreset) n++
  if (f.similarityRange.min !== null || f.similarityRange.max !== null) n++
  if (f.lunarGroup) n++
  if (f.apolloMission) n++
  for (const r of Object.values(f.ranges)) {
    if (r && (r.min !== null || r.max !== null)) n++
  }
  for (const v of Object.values(f.categories)) {
    if (typeof v === 'string' && v.trim() !== '') n++
  }
  return n
}

export function hasActiveFilters(g: GlobalFilter, f?: LayerFilter): boolean {
  return countGlobalFilters(g) > 0 || countLayerFilters(f) > 0
}

/** Great-circle distance between two WGS84 coordinates in kilometers. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function inGeoBoxes(lat: number, lon: number, boxes: GeoEnvelope[]): boolean {
  return boxes.some(b => lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east)
}

export interface LayerFilterCapabilities {
  mineralField?: LayerField
  mineralOptions: string[]
  similarityField?: LayerField
  chemSimilarityField?: LayerField
  southPoleField?: LayerField
  kreepField?: LayerField
  brazilField?: LayerField
  lunarGroupField?: LayerField
  apolloMissionField?: LayerField
  countryField?: LayerField
  oxideFields: LayerField[]
  numericFields: LayerField[]
  categoricalFields: LayerField[]
}

const byLabel = (fields: LayerField[], names: string[]): LayerField | undefined =>
  fields.find(f => names.includes(f.label.trim().toLowerCase()) || names.includes(f.key.trim().toLowerCase()))

export function detectLayerCapabilities(layer: Layer): LayerFilterCapabilities {
  const { fields, rows } = layer
  const mineralField = byLabel(fields, ['rock_name', 'classification', 'category', 'lithology', 'class_name'])
  const similarityField = byLabel(fields, ['sim_lua_quimica_x_temp', 'sim_lua', 'moon relevance (1-5)', 'sim_temp_lua'])
  const chemSimilarityField = byLabel(fields, ['sim_lua'])
  const southPoleField = byLabel(fields, ['sim_temp_polo_sul'])
  const kreepField = byLabel(fields, ['mais_parecido_com_kreep', 'sim_lua_kreep'])
  const brazilField = byLabel(fields, ['brasil'])
  const lunarGroupField = byLabel(fields, ['grupo_lunar_mais_proximo'])
  const apolloMissionField = byLabel(fields, ['missao_amostra_mais_proxima'])
  const countryField = byLabel(fields, ['country', 'country/region', 'location'])

  const oxideFields = fields.filter(f => OXIDE_DEFAULTS[f.label.trim().toLowerCase()] !== undefined)
  const coordLabels = new Set(['lat', 'latitude', 'lon', 'lng', 'long', 'longitude', 'id', 'plot_id'])
  const numericFields = fields.filter(f => f.type === 'number' && !coordLabels.has(f.label.trim().toLowerCase()))
  const skipCat = new Set(['id', 'citation', 'source_file', 'source url', 'lat', 'lon', 'latitude', 'longitude'])
  const categoricalFields = fields.filter(f => f.type === 'string' && !skipCat.has(f.label.trim().toLowerCase()))

  let mineralOptions: string[] = []
  if (mineralField) {
    if (rows.length > 0) {
      const set = new Set<string>()
      for (const r of rows) {
        const v = r[mineralField.key]
        if (typeof v === 'string' && !isSentinelOrNull(v)) set.add(normalizeRockOrMineral(v))
      }
      mineralOptions = [...set].sort()
    } else {
      mineralOptions = COMMON_BASALT_MINERALS
    }
  }

  return {
    mineralField,
    mineralOptions,
    similarityField,
    chemSimilarityField,
    southPoleField,
    kreepField,
    brazilField,
    lunarGroupField,
    apolloMissionField,
    countryField,
    oxideFields,
    numericFields,
    categoricalFields,
  }
}

export function fieldRangeBounds(layer: Layer, field: LayerField): { min: number; max: number; step: number } {
  const ox = OXIDE_DEFAULTS[field.label.trim().toLowerCase()]
  if (ox) return ox
  const lbl = field.label.trim().toLowerCase()
  if (lbl.startsWith('sim_') || lbl.includes('pct_') || lbl.includes('percentil')) {
    return { min: 0, max: 100, step: 1 }
  }
  if (layer.rows.length > 0) {
    let min = Infinity
    let max = -Infinity
    for (const r of layer.rows) {
      const v = r[field.key]
      if (typeof v === 'number' && !isSentinelOrNull(v)) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const span = Math.max(1, max - min)
      return { min: Math.floor(min), max: Math.ceil(max), step: span > 50 ? 1 : 0.5 }
    }
  }
  return { min: -100, max: 5000, step: 1 }
}

export function distinctCategoryOptions(layer: Layer, field: LayerField): string[] {
  if (layer.rows.length > 0) {
    const s = new Set<string>()
    for (const r of layer.rows) {
      const v = r[field.key]
      if (typeof v === 'string' && !isSentinelOrNull(v)) s.add(v.trim())
    }
    return [...s].slice(0, 50).sort()
  }
  const lbl = field.label.trim().toLowerCase()
  if (lbl === 'grupo_lunar_mais_proximo') return LUNAR_GROUPS
  if (lbl === 'missao_amostra_mais_proxima') return APOLLO_MISSIONS
  if (lbl === 'tectonic_setting') {
    return [
      'CONTINENTAL FLOOD BASALT',
      'OCEANIC PLATEAU',
      'OCEAN ISLAND',
      'ARCHEAN CRATON (INCLUDING GREENSTONE BELTS)',
      'INTRAPLATE VOLCANICS',
      'CONVERGENT MARGIN',
      'RIFT VOLCANICS',
    ]
  }
  return []
}

export function matchesGlobalFilter(row: LayerRow, fields: LayerField[], g: GlobalFilter): boolean {
  if (g.continent) {
    const cont = CONTINENTS.find(c => c.id === g.continent)
    if (cont && !inGeoBoxes(row.latitude, row.longitude, cont.boxes)) return false
  }
  if (g.country) {
    const country = COUNTRIES.find(c => c.id === g.country)
    if (country) {
      const brazilField = byLabel(fields, ['brasil'])
      if (country.id === 'BR' && brazilField) {
        const bVal = row[brazilField.key]
        if (bVal !== 1 && bVal !== '1') return false
      } else {
        const countryField = byLabel(fields, ['country', 'country/region', 'location'])
        const textVal = countryField ? String(row[countryField.key] ?? '').toLowerCase() : ''
        const keywordMatch = textVal !== '' && country.keywords.some(k => textVal.includes(k))
        const boxMatch = inGeoBoxes(row.latitude, row.longitude, country.boxes)
        if (!keywordMatch && !boxMatch) return false
      }
    }
  }
  const circles = activeCircles(g)
  if (circles.length > 0) {
    const insideAny = circles.some(c => haversineKm(row.latitude, row.longitude, c.lat, c.lon) <= c.km)
    if (!insideAny) return false
  }
  return true
}

function checkNumericRange(val: unknown, range: NumericRangeFilter, hideMissing: boolean): boolean {
  if (isSentinelOrNull(val)) return !hideMissing
  const num = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(num) || num === -999) return !hideMissing
  if (range.min !== null && num < range.min) return false
  if (range.max !== null && num > range.max) return false
  return true
}

export function matchesLayerFilter(row: LayerRow, layer: Layer, f?: LayerFilter): boolean {
  if (!f || countLayerFilters(f) === 0) return true
  const caps = detectLayerCapabilities(layer)
  const checks: boolean[] = []

  if (f.minerals.length > 0 && caps.mineralField) {
    const raw = row[caps.mineralField.key]
    if (isSentinelOrNull(raw)) checks.push(!f.hideMissing)
    else {
      const norm = normalizeRockOrMineral(String(raw)).toLowerCase()
      checks.push(f.minerals.some(m => norm.includes(m.toLowerCase())))
    }
  }

  if (f.similarityPreset) {
    switch (f.similarityPreset) {
      case 'high_chem_temp': {
        const fld = caps.similarityField ?? caps.chemSimilarityField
        if (fld) checks.push(checkNumericRange(row[fld.key], { min: 70, max: null }, f.hideMissing))
        break
      }
      case 'high_chem': {
        const fld = caps.chemSimilarityField ?? caps.similarityField
        if (fld) checks.push(checkNumericRange(row[fld.key], { min: 70, max: null }, f.hideMissing))
        break
      }
      case 'south_pole': {
        if (caps.southPoleField) checks.push(checkNumericRange(row[caps.southPoleField.key], { min: 80, max: null }, f.hideMissing))
        break
      }
      case 'kreep': {
        if (caps.kreepField) {
          const v = row[caps.kreepField.key]
          checks.push(v === 1 || v === '1' || (typeof v === 'number' && v >= 50))
        }
        break
      }
      case 'brazil_only': {
        if (caps.brazilField) {
          const v = row[caps.brazilField.key]
          checks.push(v === 1 || v === '1')
        } else {
          checks.push(inGeoBoxes(row.latitude, row.longitude, COUNTRIES.find(c => c.id === 'BR')!.boxes))
        }
        break
      }
    }
  }

  if ((f.similarityRange.min !== null || f.similarityRange.max !== null) && caps.similarityField) {
    checks.push(checkNumericRange(row[caps.similarityField.key], f.similarityRange, f.hideMissing))
  }

  if (f.lunarGroup && caps.lunarGroupField) {
    const v = row[caps.lunarGroupField.key]
    checks.push(!isSentinelOrNull(v) && String(v).toLowerCase() === f.lunarGroup.toLowerCase())
  }

  if (f.apolloMission && caps.apolloMissionField) {
    const v = row[caps.apolloMissionField.key]
    checks.push(!isSentinelOrNull(v) && String(v).toLowerCase().includes(f.apolloMission.toLowerCase()))
  }

  for (const [key, range] of Object.entries(f.ranges)) {
    if (!range || (range.min === null && range.max === null)) continue
    if (!layer.fields.some(fld => fld.key === key)) continue
    checks.push(checkNumericRange(row[key], range, f.hideMissing))
  }

  for (const [key, val] of Object.entries(f.categories)) {
    if (!val || val.trim() === '') continue
    if (!layer.fields.some(fld => fld.key === key)) continue
    const raw = row[key]
    if (isSentinelOrNull(raw)) checks.push(!f.hideMissing)
    else checks.push(String(raw).toLowerCase().includes(val.trim().toLowerCase()))
  }

  if (checks.length === 0) return true
  return f.mode === 'or' ? checks.some(Boolean) : checks.every(Boolean)
}

export function filterLayerRows(layer: Layer, g: GlobalFilter, f?: LayerFilter): LayerRow[] {
  return layer.rows.filter(r => matchesGlobalFilter(r, layer.fields, g) && matchesLayerFilter(r, layer, f))
}

export function computeRowsBounds(rows: LayerRow[]): LatLngBoundsTuple | null {
  if (rows.length === 0) return null
  let s = Infinity
  let w = Infinity
  let n = -Infinity
  let e = -Infinity
  for (const r of rows) {
    if (r.latitude < s) s = r.latitude
    if (r.longitude < w) w = r.longitude
    if (r.latitude > n) n = r.latitude
    if (r.longitude > e) e = r.longitude
  }
  return [[s, w], [n, e]]
}

/**
 * Resolved server-side filter payload sent in `?filter=` for remote (PostGIS) layers.
 * Field keys are resolved on the client from `layer.fields` (`c0`, `c1`, ...) and
 * strictly validated on the server against `^c\d{1,3}$`.
 */
export interface ServerFilterRule {
  kind: 'range' | 'text' | 'equals_one'
  field: string
  min?: number | null
  max?: number | null
  values?: string[]
  hideMissing?: boolean
}

export interface ServerFilterPayload {
  boxes?: GeoEnvelope[]
  distance?: { lat: number; lon: number; km: number }
  distances?: { lat: number; lon: number; km: number }[]
  brazilField?: string
  mode?: 'and' | 'or'
  rules?: ServerFilterRule[]
}

export function buildServerFilterPayload(layer: Layer, g: GlobalFilter, f?: LayerFilter): ServerFilterPayload | null {
  if (!hasActiveFilters(g, f)) return null
  const caps = detectLayerCapabilities(layer)
  const payload: ServerFilterPayload = {}

  if (g.country) {
    const country = COUNTRIES.find(c => c.id === g.country)
    if (country) {
      if (country.id === 'BR' && caps.brazilField) payload.brazilField = caps.brazilField.key
      else payload.boxes = country.boxes
    }
  } else if (g.continent) {
    const cont = CONTINENTS.find(c => c.id === g.continent)
    if (cont) payload.boxes = cont.boxes
  }

  const circles = activeCircles(g)
  if (circles.length === 1) {
    payload.distance = { lat: circles[0]!.lat, lon: circles[0]!.lon, km: circles[0]!.km }
  } else if (circles.length > 1) {
    payload.distances = circles.map(c => ({ lat: c.lat, lon: c.lon, km: c.km }))
  }

  if (f && countLayerFilters(f) > 0) {
    payload.mode = f.mode
    const rules: ServerFilterRule[] = []

    if (f.minerals.length > 0 && caps.mineralField) {
      rules.push({ kind: 'text', field: caps.mineralField.key, values: f.minerals, hideMissing: f.hideMissing })
    }

    if (f.similarityPreset) {
      switch (f.similarityPreset) {
        case 'high_chem_temp': {
          const fld = caps.similarityField ?? caps.chemSimilarityField
          if (fld) rules.push({ kind: 'range', field: fld.key, min: 70, max: null, hideMissing: f.hideMissing })
          break
        }
        case 'high_chem': {
          const fld = caps.chemSimilarityField ?? caps.similarityField
          if (fld) rules.push({ kind: 'range', field: fld.key, min: 70, max: null, hideMissing: f.hideMissing })
          break
        }
        case 'south_pole': {
          if (caps.southPoleField) rules.push({ kind: 'range', field: caps.southPoleField.key, min: 80, max: null, hideMissing: f.hideMissing })
          break
        }
        case 'kreep': {
          if (caps.kreepField) rules.push({ kind: 'equals_one', field: caps.kreepField.key })
          break
        }
        case 'brazil_only': {
          if (caps.brazilField) rules.push({ kind: 'equals_one', field: caps.brazilField.key })
          else payload.boxes = COUNTRIES.find(c => c.id === 'BR')!.boxes
          break
        }
      }
    }

    if ((f.similarityRange.min !== null || f.similarityRange.max !== null) && caps.similarityField) {
      rules.push({
        kind: 'range',
        field: caps.similarityField.key,
        min: f.similarityRange.min,
        max: f.similarityRange.max,
        hideMissing: f.hideMissing,
      })
    }

    if (f.lunarGroup && caps.lunarGroupField) {
      rules.push({ kind: 'text', field: caps.lunarGroupField.key, values: [f.lunarGroup], hideMissing: f.hideMissing })
    }

    if (f.apolloMission && caps.apolloMissionField) {
      rules.push({ kind: 'text', field: caps.apolloMissionField.key, values: [f.apolloMission], hideMissing: f.hideMissing })
    }

    for (const [key, range] of Object.entries(f.ranges)) {
      if (!range || (range.min === null && range.max === null)) continue
      if (!layer.fields.some(fld => fld.key === key)) continue
      rules.push({ kind: 'range', field: key, min: range.min, max: range.max, hideMissing: f.hideMissing })
    }

    for (const [key, val] of Object.entries(f.categories)) {
      if (!val || val.trim() === '') continue
      if (!layer.fields.some(fld => fld.key === key)) continue
      rules.push({ kind: 'text', field: key, values: [val.trim()], hideMissing: f.hideMissing })
    }

    if (rules.length > 0) payload.rules = rules
  }

  return Object.keys(payload).length > 0 ? payload : null
}
