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
