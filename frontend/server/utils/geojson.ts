import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'

export interface GeojsonResult { csv: string; rows: number; skipped: number }

type Pos = [number, number]
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** [lon, lat] (a z value is ignored), or null when missing, non-numeric or out of WGS84 range. */
function pos(v: unknown): Pos | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const [lon, lat] = v as unknown[]
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return lat < -90 || lat > 90 || lon < -180 || lon > 180 ? null : [lon, lat]
}

/** Vertices of a line or polygon (outer rings only, closing duplicate dropped). */
function vertices(type: string, c: unknown): unknown[] {
  if (!Array.isArray(c)) return []
  switch (type) {
    case 'LineString': return c
    case 'MultiLineString': return c.flat(1)
    case 'Polygon': return ring(c[0])
    case 'MultiPolygon': return c.flatMap(p => (Array.isArray(p) ? ring(p[0]) : []))
    default: return []
  }
}
function ring(r: unknown): unknown[] {
  if (!Array.isArray(r)) return []
  const first = r[0], last = r[r.length - 1]
  const closed = r.length > 1 && Array.isArray(first) && Array.isArray(last) && first[0] === last[0] && first[1] === last[1]
  return closed ? r.slice(0, -1) : r
}

/** One position per output row for a geometry (several for MultiPoint / GeometryCollection). */
function geometryPositions(g: unknown): Pos[] {
  if (!isObj(g) || typeof g.type !== 'string') return []
  if (g.type === 'Point') { const p = pos(g.coordinates); return p ? [p] : [] }
  if (g.type === 'MultiPoint') return (Array.isArray(g.coordinates) ? g.coordinates : []).map(pos).filter((p): p is Pos => p !== null)
  if (g.type === 'GeometryCollection') return (Array.isArray(g.geometries) ? g.geometries : []).flatMap(geometryPositions)
  const vs = vertices(g.type, g.coordinates).map(pos).filter((p): p is Pos => p !== null)
  if (!vs.length) return []
  return [[vs.reduce((s, p) => s + p[0], 0) / vs.length, vs.reduce((s, p) => s + p[1], 0) / vs.length]]
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const SHADOWS = /^(lat|latitude|lon|lng|long|longitude)$/i

/**
 * Converts a GeoJSON object (FeatureCollection, Feature or bare geometry) to CSV text with
 * `lat,lon` first and one column per property. Features whose geometry yields no valid position
 * are skipped and counted.
 */
export function geojsonToCsv(input: unknown): GeojsonResult {
  if (!isObj(input) || typeof input.type !== 'string') throw new Error('Input is not GeoJSON (expected a "type" member).')
  const features: Obj[] = input.type === 'FeatureCollection' && Array.isArray(input.features) ? input.features.filter(isObj)
    : input.type === 'Feature' ? [input]
      : input.type === 'FeatureCollection' ? []
        : [{ type: 'Feature', geometry: input, properties: {} }]

  const keys: string[] = []
  const seen = new Set<string>()
  const rows: { p: Pos; props: Obj }[] = []
  let skipped = 0
  for (const f of features) {
    const ps = geometryPositions(f.geometry)
    if (!ps.length) { skipped++; continue }
    const props = isObj(f.properties) ? f.properties : {}
    for (const k of Object.keys(props)) if (!seen.has(k)) { seen.add(k); keys.push(k) }
    for (const p of ps) rows.push({ p, props })
  }
  if (!rows.length) throw new Error('The GeoJSON has no usable geometries (need Point, MultiPoint, lines or polygons with valid coordinates).')

  const header = ['lat', 'lon', ...keys.map(k => (SHADOWS.test(k) ? `prop_${k}` : k))]
  const lines = [header.map(cell).join(',')]
  for (const { p, props } of rows) lines.push([p[1], p[0], ...keys.map(k => props[k])].map(cell).join(','))
  return { csv: lines.join('\n') + '\n', rows: rows.length, skipped }
}

/** Reads a GeoJSON file and writes `<name>.csv` beside it (or to `outPath`); never overwrites. */
export async function convertGeojsonFile(path: string, outPath?: string): Promise<GeojsonResult & { outPath: string }> {
  const src = resolve(path)
  const s = await stat(src).catch(() => undefined)
  if (!s) throw new Error(`File not found: ${src}`)
  if (!s.isFile()) throw new Error(`Not a file: ${src}`)
  let data: unknown
  try { data = JSON.parse(await readFile(src, 'utf8')) } catch { throw new Error(`The file is not valid JSON: ${src}`) }
  const result = geojsonToCsv(data)
  const out = resolve(outPath ?? join(dirname(src), `${basename(src, extname(src))}.csv`))
  try { await writeFile(out, result.csv, { flag: 'wx' }) } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') throw new Error(`Output already exists: ${out}`)
    throw e
  }
  return { ...result, outPath: out }
}
