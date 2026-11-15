/** Pure helpers for viewport clustering: request parsing and grid geometry. */

/** Target width of a cluster cell on screen, in CSS pixels. */
export const CLUSTER_PX = 56
export const MAX_ZOOM = 22

export interface Bbox { west: number; south: number; east: number; north: number }

/** Width in degrees of a grid cell that is CLUSTER_PX wide at `zoom` (256 px world tile). */
export const cellSizeDegrees = (zoom: number) => (CLUSTER_PX * 360) / (256 * 2 ** zoom)

const num = (s: string): number | null => {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function parseZoom(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const n = num(raw)
  if (n === null) return null
  const z = Math.round(n)
  return z >= 0 && z <= MAX_ZOOM ? z : null
}

/** `west,south,east,north` in WGS84 degrees. west > east means the box crosses the antimeridian. */
export function parseBbox(raw: unknown): Bbox | null {
  if (typeof raw !== 'string') return null
  const parts = raw.split(',')
  if (parts.length !== 4) return null
  const v = parts.map(num)
  if (v.some(n => n === null)) return null
  const [west, south, east, north] = v as number[]
  if (south! > north! || south! < -90 || north! > 90) return null
  if (west! < -180 || west! > 180 || east! < -180 || east! > 180) return null
  return { west: west!, south: south!, east: east!, north: north! }
}

/** One envelope [w, s, e, n] per contiguous longitude range (two when crossing the antimeridian). */
export function bboxEnvelopes(b: Bbox): [number, number, number, number][] {
  if (b.west <= b.east) return [[b.west, b.south, b.east, b.north]]
  return [[b.west, b.south, 180, b.north], [-180, b.south, b.east, b.north]]
}

/** A non-negative 32-bit integer path parameter. */
export function parseRowIdx(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d{1,10}$/.test(raw)) return null
  const n = Number(raw)
  return n <= 2_147_483_647 ? n : null
}

const FIELD_KEY = /^c\d{1,3}$/

export interface ParsedFilterRule {
  kind: 'range' | 'text' | 'equals_one'
  field: string
  min?: number | null
  max?: number | null
  values?: string[]
  hideMissing?: boolean
}

/** Largest cross-layer proximity radius accepted, in km (about half the Earth's circumference). */
export const MAX_NEAR_KM = 20000
/** Most other layers one proximity filter may reference. */
export const MAX_NEAR_LAYERS = 50

/** A layer's own filters (region and per-layer rules), without proximity. */
export interface ParsedLayerFilter {
  boxes?: Bbox[]
  brazilField?: string
  mode?: 'and' | 'or'
  rules?: ParsedFilterRule[]
}

/** Another layer a point must have a match in: that layer's id and its own filters. */
export interface NearLayer { layerId: string; filter: ParsedLayerFilter }

/**
 * Cross-layer proximity: a point passes only when EVERY listed layer has a point, passing
 * that layer's own filters, within `km` kilometres of it.
 */
export interface NearFilter { km: number; layers: NearLayer[] }

export interface ParsedServerFilter extends ParsedLayerFilter {
  near?: NearFilter
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const LAYER_ID = /^[0-9a-fA-F-]{36}$/

/** Parses the region and rule parts of a filter object; `null` when malformed. */
function parseLayerFilter(obj: Record<string, unknown>): ParsedLayerFilter | null {
  const out: ParsedLayerFilter = {}

  if (obj.brazilField !== undefined) {
    if (typeof obj.brazilField !== 'string' || !FIELD_KEY.test(obj.brazilField)) return null
    out.brazilField = obj.brazilField
  }

  if (obj.boxes !== undefined) {
    if (!Array.isArray(obj.boxes) || obj.boxes.length === 0 || obj.boxes.length > 10) return null
    const boxes: Bbox[] = []
    for (const b of obj.boxes) {
      if (!isObj(b)) return null
      const { west, south, east, north } = b
      if (
        typeof west !== 'number' || typeof south !== 'number' ||
        typeof east !== 'number' || typeof north !== 'number' ||
        !Number.isFinite(west) || !Number.isFinite(south) ||
        !Number.isFinite(east) || !Number.isFinite(north) ||
        south > north || south < -90 || north > 90 ||
        west < -180 || west > 180 || east < -180 || east > 180
      ) return null
      boxes.push({ west, south, east, north })
    }
    out.boxes = boxes
  }

  if (obj.mode !== undefined) {
    if (obj.mode !== 'and' && obj.mode !== 'or') return null
    out.mode = obj.mode
  }

  if (obj.rules !== undefined) {
    if (!Array.isArray(obj.rules) || obj.rules.length > 30) return null
    const rules: ParsedFilterRule[] = []
    for (const r of obj.rules) {
      if (!isObj(r) || typeof r.field !== 'string' || !FIELD_KEY.test(r.field)) return null
      const hideMissing = r.hideMissing !== false
      if (r.kind === 'equals_one') {
        rules.push({ kind: 'equals_one', field: r.field })
      } else if (r.kind === 'range') {
        const min = r.min === null || r.min === undefined ? null : (typeof r.min === 'number' && Number.isFinite(r.min) ? r.min : NaN)
        const max = r.max === null || r.max === undefined ? null : (typeof r.max === 'number' && Number.isFinite(r.max) ? r.max : NaN)
        if (Number.isNaN(min) || Number.isNaN(max) || (min === null && max === null)) return null
        rules.push({ kind: 'range', field: r.field, min, max, hideMissing })
      } else if (r.kind === 'text') {
        if (!Array.isArray(r.values) || r.values.length === 0 || r.values.length > 20) return null
        const vals: string[] = []
        for (const v of r.values) {
          if (typeof v !== 'string' || v.trim() === '' || v.length > 120) return null
          vals.push(v.trim())
        }
        rules.push({ kind: 'text', field: r.field, values: vals, hideMissing })
      } else {
        return null
      }
    }
    if (rules.length > 0) out.rules = rules
  }

  return out
}

/**
 * Parses and validates an optional JSON `?filter=` query string.
 * Returns `undefined` when absent/empty, or `null` when malformed.
 */
export function parseFilterParam(raw: unknown): ParsedServerFilter | undefined | null {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string' || raw.length > 65536) return null
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(obj)) return null

  const out: ParsedServerFilter | null = parseLayerFilter(obj)
  if (!out) return null

  if (obj.near !== undefined) {
    if (!isObj(obj.near)) return null
    const { km, layers } = obj.near
    if (typeof km !== 'number' || !Number.isFinite(km) || km <= 0 || km > MAX_NEAR_KM) return null
    if (!Array.isArray(layers) || layers.length === 0 || layers.length > MAX_NEAR_LAYERS) return null
    const list: NearLayer[] = []
    for (const l of layers) {
      if (!isObj(l) || typeof l.layerId !== 'string' || !LAYER_ID.test(l.layerId)) return null
      const f = l.filter === undefined ? {} : isObj(l.filter) ? parseLayerFilter(l.filter) : null
      if (!f) return null
      list.push({ layerId: l.layerId, filter: f })
    }
    out.near = { km, layers: list }
  }

  return Object.keys(out).length > 0 ? out : undefined
}
