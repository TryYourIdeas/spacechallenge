import type { ClusterItem, ClusterResponse, FieldCatalog, PointSummary, FieldType, LatLngBoundsTuple, Layer, LayerField, LayerMeta, LayerRow } from '~/types/layers'

const FIELD_TYPES: FieldType[] = ['string', 'number', 'date']
const SHAPES: LayerMeta['shape'][] = ['circle', 'square', 'diamond', 'triangle']
const COLOR = /^#[0-9a-fA-F]{6}$/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`${what} must be a non-empty string`)
  return v
}

export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  )
}

export function parseLayerIndex(raw: unknown): LayerMeta[] {
  if (!isRecord(raw) || !Array.isArray(raw.layers)) throw new Error('Layer index must contain a "layers" array')
  const seen = new Set<string>()
  return raw.layers.map((item, i): LayerMeta => {
    if (!isRecord(item)) throw new Error(`Layer ${i} must be an object`)
    const id = str(item.id, `Layer ${i} id`)
    if (seen.has(id)) throw new Error(`Duplicate layer id "${id}"`)
    seen.add(id)
    const color = str(item.color, `Layer "${id}" color`)
    if (!COLOR.test(color)) throw new Error(`Layer "${id}" color must be #RRGGBB`)
    const shape = SHAPES.includes(item.shape as never) ? (item.shape as LayerMeta['shape']) : 'circle'
    return {
      id, color, shape,
      label: str(item.label, `Layer "${id}" label`),
      description: typeof item.description === 'string' ? item.description : '',
      source: str(item.source, `Layer "${id}" source`),
    }
  })
}

function parseFields(meta: LayerMeta, raw: unknown[]): LayerField[] {
  return raw.map((f, i) => {
    if (!isRecord(f)) throw new Error(`Field ${i} of "${meta.id}" must be an object`)
    const type = FIELD_TYPES.includes(f.type as never) ? (f.type as FieldType) : 'string'
    return {
      key: str(f.key, `Field ${i} key`),
      label: str(f.label, `Field ${i} label`),
      type,
      ...(typeof f.unit === 'string' ? { unit: f.unit } : {}),
    }
  })
}

const isBounds = (b: unknown): b is LatLngBoundsTuple =>
  Array.isArray(b) && b.length === 2 && b.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n)))

const DATA_TYPES = ['number', 'boolean', 'text', 'date']
const FILTER_KINDS = ['select', 'range', 'boolean', 'date_range', 'text']

/** Validates the catalog of a server layer; malformed entries are dropped (filters fall back to defaults). */
export function parseCatalog(raw: unknown): FieldCatalog[] {
  if (!Array.isArray(raw)) return []
  const out: FieldCatalog[] = []
  for (const c of raw) {
    if (!isRecord(c) || typeof c.key !== 'string' || !DATA_TYPES.includes(c.dataType as string) || !FILTER_KINDS.includes(c.filterKind as string)) continue
    const bound = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string' ? v : null
    out.push({
      key: c.key,
      dataType: c.dataType as FieldCatalog['dataType'],
      filterKind: c.filterKind as FieldCatalog['filterKind'],
      valueCount: typeof c.valueCount === 'number' ? c.valueCount : 0,
      missingCount: typeof c.missingCount === 'number' ? c.missingCount : 0,
      distinctCount: typeof c.distinctCount === 'number' ? c.distinctCount : null,
      min: bound(c.min),
      max: bound(c.max),
      options: Array.isArray(c.options) && c.options.every(o => typeof o === 'string') ? (c.options as string[]) : null,
    })
  }
  return out
}

/** A layer stored on the server: columns and a summary only. Its points arrive per viewport. */
export function parseRemoteLayer(meta: LayerMeta, raw: unknown): Layer {
  if (!isRecord(raw) || !Array.isArray(raw.fields)) throw new Error(`Summary for "${meta.id}" must contain a "fields" array`)
  if (typeof raw.rowCount !== 'number' || !Number.isFinite(raw.rowCount)) throw new Error(`Summary for "${meta.id}" needs a numeric "rowCount"`)
  if (raw.bounds !== null && !isBounds(raw.bounds)) throw new Error(`Summary for "${meta.id}" has invalid "bounds"`)
  return {
    ...meta,
    fields: parseFields(meta, raw.fields),
    rows: [],
    catalog: parseCatalog(raw.catalog),
    skipped: typeof raw.skipped === 'number' ? raw.skipped : 0,
    remote: { rowCount: raw.rowCount, bounds: raw.bounds },
  }
}

/** Validates a clusters response. Malformed items are dropped so one bad cell cannot blank the map. */
export function parseClusterResponse(raw: unknown): ClusterResponse {
  if (!isRecord(raw) || !Array.isArray(raw.items)) throw new Error('Cluster response must contain an "items" array')
  const items: ClusterItem[] = []
  for (const it of raw.items) {
    if (!isRecord(it) || typeof it.count !== 'number' || it.count < 1) continue
    if (!isValidCoordinate(it.latitude, it.longitude) || !isBounds(it.bounds)) continue
    if (it.count === 1 && (typeof it.id !== 'string' || it.id === '')) continue
    items.push({
      count: it.count, latitude: it.latitude as number, longitude: it.longitude as number, bounds: it.bounds,
      ...(it.count === 1 ? { id: it.id as string } : {}),
      ...(typeof it.name === 'string' && it.name ? { name: it.name } : {}),
    })
  }
  return {
    items,
    truncated: raw.truncated === true,
    ...(typeof raw.filteredCount === 'number' && Number.isFinite(raw.filteredCount) ? { filteredCount: raw.filteredCount } : {}),
    ...(raw.filteredBounds === null || isBounds(raw.filteredBounds) ? { filteredBounds: raw.filteredBounds } : {}),
  }
}

export function parsePointList(raw: unknown): { points: PointSummary[]; truncated: boolean } {
  if (!isRecord(raw) || !Array.isArray(raw.points)) throw new Error('Point list must contain a "points" array')
  const points: PointSummary[] = []
  for (const p of raw.points) {
    if (!isRecord(p) || typeof p.id !== 'string' || !isValidCoordinate(p.latitude, p.longitude)) continue
    points.push({
      id: p.id, latitude: p.latitude as number, longitude: p.longitude as number,
      ...(typeof p.name === 'string' && p.name ? { name: p.name } : {}),
    })
  }
  return { points, truncated: raw.truncated === true }
}

/** One full point row as returned by `/api/layers/:id/points/:row`. */
export function parsePointRow(raw: unknown): LayerRow {
  if (!isRecord(raw) || !isValidCoordinate(raw.latitude, raw.longitude) || raw.id == null) {
    throw new Error('Point data is not valid')
  }
  return { ...(raw as Record<string, string | number | null>), id: String(raw.id) } as LayerRow
}

export function parseLayer(meta: LayerMeta, raw: unknown): Layer {
  if (!isRecord(raw) || !Array.isArray(raw.fields) || !Array.isArray(raw.rows)) {
    throw new Error(`Table for "${meta.id}" must contain "fields" and "rows" arrays`)
  }
  const fields = parseFields(meta, raw.fields)
  const rows: LayerRow[] = []
  let skipped = 0
  const ids = new Set<string>()
  raw.rows.forEach((r, i) => {
    if (!isRecord(r) || !isValidCoordinate(r.latitude, r.longitude)) { skipped++; return }
    const id = r.id == null ? String(i) : String(r.id)
    if (ids.has(id)) { skipped++; return }
    ids.add(id)
    rows.push({ ...(r as Record<string, string | number | null>), id } as LayerRow)
  })
  // Imported layers report rows the server dropped before sending.
  const serverSkipped = typeof raw.skipped === 'number' ? raw.skipped : 0
  return { ...meta, fields, rows, skipped: skipped + serverSkipped }
}

export function formatValue(field: LayerField, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  if (field.type === 'number' && typeof value === 'number') {
    const n = value.toLocaleString('en-US', { maximumFractionDigits: 6 })
    return field.unit ? `${n} ${field.unit}` : n
  }
  return String(value)
}
