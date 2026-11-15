import type { Pool } from 'pg'
import { bboxEnvelopes, cellSizeDegrees, type Bbox, type ParsedServerFilter } from './clusters'

export interface ClusterItem {
  /** Number of points in the cell; 1 means a single point (`id`/`name` set). */
  count: number
  latitude: number
  longitude: number
  /** [[south, west], [north, east]] of the points in the cell. */
  bounds: [[number, number], [number, number]]
  id?: string
  name?: string
}
export interface ClusterResult {
  items: ClusterItem[]
  truncated: boolean
  filteredCount?: number
  filteredBounds?: [[number, number], [number, number]] | null
}
export interface PointSummary { id: string; latitude: number; longitude: number; name?: string }

export const MAX_ITEMS = 1500
export const MAX_LIST = 50

const NUM_RE = '^[-+]?(\\d+\\.?\\d*|\\.\\d+)([eE][-+]?\\d+)?$'

/**
 * SQL predicate for "geom is inside the box" with its parameters, numbered from `first`.
 * `&&` is what layer_points_geom_idx accelerates. A box that crosses the antimeridian
 * becomes two envelopes OR-ed together (a bitmap OR over the same index).
 */
export function inBox(bbox: Bbox, first: number): { sql: string; params: number[] } {
  const parts: string[] = []
  const params: number[] = []
  for (const [w, s, e, n] of bboxEnvelopes(bbox)) {
    const i = first + params.length
    parts.push(`geom && ST_MakeEnvelope($${i}, $${i + 1}, $${i + 2}, $${i + 3}, 4326)`)
    params.push(w, s, e, n)
  }
  return { sql: parts.length === 1 ? parts[0]! : `(${parts.join(' OR ')})`, params }
}

/**
 * Parameterized SQL predicate for global (continent/country/distance) and per-layer
 * (mineral, lunar similarity, oxide ranges, categories) filters.
 */
export function filterPredicate(
  filter: ParsedServerFilter | undefined,
  first: number,
): { sql: string; params: (number | string)[] } {
  if (!filter) return { sql: 'TRUE', params: [] }
  const clauses: string[] = []
  const params: (number | string)[] = []
  const push = (v: number | string) => {
    params.push(v)
    return `$${first + params.length - 1}`
  }

  if (filter.brazilField) {
    const f = push(filter.brazilField)
    clauses.push(`((data ->> ${f}::text) IN ('1', '1.0'))`)
  }

  if (filter.boxes && filter.boxes.length > 0) {
    const boxParts: string[] = []
    for (const b of filter.boxes) {
      for (const [w, s, e, n] of bboxEnvelopes(b)) {
        const pW = push(w)
        const pS = push(s)
        const pE = push(e)
        const pN = push(n)
        boxParts.push(`geom && ST_MakeEnvelope(${pW}, ${pS}, ${pE}, ${pN}, 4326)`)
      }
    }
    if (boxParts.length > 0) clauses.push(`(${boxParts.join(' OR ')})`)
  }

  if (filter.distance) {
    const pLon = push(filter.distance.lon)
    const pLat = push(filter.distance.lat)
    const pMeters = push(filter.distance.km * 1000)
    clauses.push(`ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${pLon}, ${pLat}), 4326)::geography, ${pMeters})`)
  }

  if (filter.rules && filter.rules.length > 0) {
    const ruleSqls: string[] = []
    for (const r of filter.rules) {
      const f = push(r.field)
      if (r.kind === 'equals_one') {
        ruleSqls.push(`((data ->> ${f}::text) IN ('1', '1.0'))`)
      } else if (r.kind === 'text' && r.values && r.values.length > 0) {
        const sub = r.values.map((v) => {
          const pVal = push(`%${v}%`)
          return `(data ->> ${f}::text) ILIKE ${pVal}`
        })
        const matchExpr = `(${sub.join(' OR ')})`
        if (r.hideMissing === false) {
          ruleSqls.push(`((data ->> ${f}::text) IS NULL OR (data ->> ${f}::text) IN ('', 'NA', '-999') OR ${matchExpr})`)
        } else {
          ruleSqls.push(`((data ->> ${f}::text) IS NOT NULL AND (data ->> ${f}::text) NOT IN ('', 'NA', '-999') AND ${matchExpr})`)
        }
      } else if (r.kind === 'range') {
        const numExpr = `(CASE WHEN (data ->> ${f}::text) ~ '${NUM_RE}' AND (data ->> ${f}::text)::float8 <> -999 THEN (data ->> ${f}::text)::float8 ELSE NULL END)`
        const bounds: string[] = []
        if (r.min !== null && r.min !== undefined) {
          const pMin = push(r.min)
          bounds.push(`${numExpr} >= ${pMin}`)
        }
        if (r.max !== null && r.max !== undefined) {
          const pMax = push(r.max)
          bounds.push(`${numExpr} <= ${pMax}`)
        }
        if (bounds.length > 0) {
          const rangeExpr = `(${bounds.join(' AND ')})`
          if (r.hideMissing === false) {
            ruleSqls.push(`(${numExpr} IS NULL OR ${rangeExpr})`)
          } else {
            ruleSqls.push(`(${numExpr} IS NOT NULL AND ${rangeExpr})`)
          }
        }
      }
    }
    if (ruleSqls.length > 0) {
      const joiner = filter.mode === 'or' ? ' OR ' : ' AND '
      clauses.push(`(${ruleSqls.join(joiner)})`)
    }
  }

  return { sql: clauses.length > 0 ? clauses.join(' AND ') : 'TRUE', params }
}

/**
 * Groups the layer's points inside `bbox` into grid cells about 56 px wide at `zoom`.
 * The grid is anchored at (0, 0), so cells stay put while the user pans.
 * Cells are returned largest first; `truncated` is set when more than `limit` cells matched.
 */
export async function clusterPoints(
  pool: Pool, layerId: string, bbox: Bbox, zoom: number, limit = MAX_ITEMS, filter?: ParsedServerFilter,
): Promise<ClusterResult> {
  const box = inBox(bbox, 3)
  const flt = filterPredicate(filter, 3 + box.params.length)
  const whereExtra = filter && flt.sql !== 'TRUE' ? ` AND ${flt.sql}` : ''
  const limitParamIdx = 3 + box.params.length + (whereExtra ? flt.params.length : 0)
  const queryParams: (string | number)[] = [
    layerId,
    cellSizeDegrees(zoom),
    ...box.params,
    ...(whereExtra ? flt.params : []),
    limit + 1,
  ]

  const { rows } = await pool.query<{
    count: number; lat: number; lon: number; s: number; w: number; n: number; e: number; first_idx: number
  }>(
    `SELECT count(*)::int AS count, avg(latitude) AS lat, avg(longitude) AS lon,
            min(latitude) AS s, min(longitude) AS w, max(latitude) AS n, max(longitude) AS e,
            min(row_idx) AS first_idx
     FROM layer_points
     WHERE layer_id = $1 AND ${box.sql}${whereExtra}
     GROUP BY ST_SnapToGrid(geom, $2::float8)
     ORDER BY count DESC, first_idx
     LIMIT $${limitParamIdx}`,
    queryParams)
  const truncated = rows.length > limit
  const kept = rows.slice(0, limit)

  const singles = kept.filter(r => r.count === 1).map(r => r.first_idx)
  const names = new Map<number, string | null>()
  if (singles.length) {
    const res = await pool.query<{ row_idx: number; name: string | null }>(
      'SELECT row_idx, name FROM layer_points WHERE layer_id = $1 AND row_idx = ANY($2::int[])', [layerId, singles])
    for (const r of res.rows) names.set(r.row_idx, r.name)
  }

  let filteredCount: number | undefined
  let filteredBounds: [[number, number], [number, number]] | null | undefined
  if (whereExtra) {
    const layerFlt = filterPredicate(filter, 2)
    const { rows: [st] } = await pool.query<{
      total: number; s: number | null; w: number | null; n: number | null; e: number | null
    }>(
      `SELECT count(*)::int AS total,
              min(latitude) AS s, min(longitude) AS w, max(latitude) AS n, max(longitude) AS e
       FROM layer_points
       WHERE layer_id = $1 AND ${layerFlt.sql}`,
      [layerId, ...layerFlt.params])
    filteredCount = st?.total ?? 0
    filteredBounds = st && st.s !== null && st.w !== null && st.n !== null && st.e !== null
      ? [[st.s, st.w], [st.n, st.e]]
      : null
  }

  return {
    truncated,
    ...(filteredCount !== undefined ? { filteredCount, filteredBounds } : {}),
    items: kept.map((r): ClusterItem => {
      const item: ClusterItem = {
        count: r.count, latitude: r.lat, longitude: r.lon, bounds: [[r.s, r.w], [r.n, r.e]],
      }
      if (r.count === 1) {
        item.id = String(r.first_idx)
        const name = names.get(r.first_idx)
        if (name) item.name = name
      }
      return item
    }),
  }
}

/** Individual points inside `bbox`: opens a cluster that zooming can no longer split (shared coordinates). */
export async function listPoints(
  pool: Pool, layerId: string, bbox: Bbox, limit = MAX_LIST, filter?: ParsedServerFilter,
): Promise<{ points: PointSummary[]; truncated: boolean }> {
  const box = inBox(bbox, 2)
  const flt = filterPredicate(filter, 2 + box.params.length)
  const whereExtra = filter && flt.sql !== 'TRUE' ? ` AND ${flt.sql}` : ''
  const limitParamIdx = 2 + box.params.length + (whereExtra ? flt.params.length : 0)
  const { rows } = await pool.query<{ row_idx: number; latitude: number; longitude: number; name: string | null }>(
    `SELECT row_idx, latitude, longitude, name FROM layer_points
     WHERE layer_id = $1 AND ${box.sql}${whereExtra}
     ORDER BY row_idx LIMIT $${limitParamIdx}`,
    [layerId, ...box.params, ...(whereExtra ? flt.params : []), limit + 1])
  return {
    truncated: rows.length > limit,
    points: rows.slice(0, limit).map(r => ({
      id: String(r.row_idx), latitude: r.latitude, longitude: r.longitude, ...(r.name ? { name: r.name } : {}),
    })),
  }
}

export interface LayerSummary {
  fields: unknown
  skipped: number
  rowCount: number
  /** [[south, west], [north, east]], or null for an empty layer. */
  bounds: [[number, number], [number, number]] | null
}

export async function layerSummary(pool: Pool, layerId: string): Promise<LayerSummary | undefined> {
  const { rows: [l] } = await pool.query('SELECT fields, skipped, row_count FROM layers WHERE id = $1', [layerId])
  if (!l) return undefined
  const { rows: [b] } = await pool.query(
    `SELECT min(latitude) AS s, min(longitude) AS w, max(latitude) AS n, max(longitude) AS e
     FROM layer_points WHERE layer_id = $1`, [layerId])
  return {
    fields: l.fields, skipped: l.skipped, rowCount: l.row_count,
    bounds: b && b.s !== null ? [[b.s, b.w], [b.n, b.e]] : null,
  }
}

/** Full row for one point, in the shape the table endpoint used to return per row. */
export async function pointDetail(pool: Pool, layerId: string, rowIdx: number) {
  const { rows: [r] } = await pool.query(
    'SELECT row_idx, latitude, longitude, name, data FROM layer_points WHERE layer_id = $1 AND row_idx = $2',
    [layerId, rowIdx])
  if (!r) return undefined
  return {
    id: String(r.row_idx), latitude: r.latitude, longitude: r.longitude,
    ...(r.name ? { name: r.name } : {}), ...r.data,
  }
}
