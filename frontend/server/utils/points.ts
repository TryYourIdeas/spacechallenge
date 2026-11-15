import type { Pool } from 'pg'
import { bboxEnvelopes, cellSizeDegrees, type Bbox } from './clusters'

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
export interface ClusterResult { items: ClusterItem[]; truncated: boolean }
export interface PointSummary { id: string; latitude: number; longitude: number; name?: string }

export const MAX_ITEMS = 1500
export const MAX_LIST = 50

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
 * Groups the layer's points inside `bbox` into grid cells about 56 px wide at `zoom`.
 * The grid is anchored at (0, 0), so cells stay put while the user pans.
 * Cells are returned largest first; `truncated` is set when more than `limit` cells matched.
 */
export async function clusterPoints(
  pool: Pool, layerId: string, bbox: Bbox, zoom: number, limit = MAX_ITEMS,
): Promise<ClusterResult> {
  const box = inBox(bbox, 3)
  const { rows } = await pool.query<{
    count: number; lat: number; lon: number; s: number; w: number; n: number; e: number; first_idx: number
  }>(
    `SELECT count(*)::int AS count, avg(latitude) AS lat, avg(longitude) AS lon,
            min(latitude) AS s, min(longitude) AS w, max(latitude) AS n, max(longitude) AS e,
            min(row_idx) AS first_idx
     FROM layer_points
     WHERE layer_id = $1 AND ${box.sql}
     GROUP BY ST_SnapToGrid(geom, $2::float8)
     ORDER BY count DESC, first_idx
     LIMIT $${3 + box.params.length}`,
    [layerId, cellSizeDegrees(zoom), ...box.params, limit + 1])
  const truncated = rows.length > limit
  const kept = rows.slice(0, limit)

  const singles = kept.filter(r => r.count === 1).map(r => r.first_idx)
  const names = new Map<number, string | null>()
  if (singles.length) {
    const res = await pool.query<{ row_idx: number; name: string | null }>(
      'SELECT row_idx, name FROM layer_points WHERE layer_id = $1 AND row_idx = ANY($2::int[])', [layerId, singles])
    for (const r of res.rows) names.set(r.row_idx, r.name)
  }
  return {
    truncated,
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
  pool: Pool, layerId: string, bbox: Bbox, limit = MAX_LIST,
): Promise<{ points: PointSummary[]; truncated: boolean }> {
  const box = inBox(bbox, 2)
  const { rows } = await pool.query<{ row_idx: number; latitude: number; longitude: number; name: string | null }>(
    `SELECT row_idx, latitude, longitude, name FROM layer_points
     WHERE layer_id = $1 AND ${box.sql}
     ORDER BY row_idx LIMIT $${2 + box.params.length}`,
    [layerId, ...box.params, limit + 1])
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
