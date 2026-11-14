import type { FieldType, Layer, LayerField, LayerMeta, LayerRow } from '~/types/layers'

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

export function parseLayer(meta: LayerMeta, raw: unknown): Layer {
  if (!isRecord(raw) || !Array.isArray(raw.fields) || !Array.isArray(raw.rows)) {
    throw new Error(`Table for "${meta.id}" must contain "fields" and "rows" arrays`)
  }
  const fields: LayerField[] = raw.fields.map((f, i) => {
    if (!isRecord(f)) throw new Error(`Field ${i} of "${meta.id}" must be an object`)
    const type = FIELD_TYPES.includes(f.type as never) ? (f.type as FieldType) : 'string'
    return {
      key: str(f.key, `Field ${i} key`),
      label: str(f.label, `Field ${i} label`),
      type,
      ...(typeof f.unit === 'string' ? { unit: f.unit } : {}),
    }
  })
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
