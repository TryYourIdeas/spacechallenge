export interface ViewBounds { west: number; south: number; east: number; north: number }

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180
const lat = (v: number) => Math.min(90, Math.max(-90, v))

/**
 * Serialises a map view as the API's `west,south,east,north` query value.
 * Longitudes are wrapped into [-180, 180]; west > east then means the view
 * crosses the antimeridian. A view of a whole world or more asks for everything.
 */
export function viewportBbox(b: ViewBounds): string {
  const south = lat(b.south)
  const north = lat(b.north)
  if (b.east - b.west >= 360) return `-180,${south},180,${north}`
  return `${wrap(b.west)},${south},${wrap(b.east)},${north}`
}

/** Pixel size of a cluster marker for `count` points (grows slowly, stays under the 56 px grid cell). */
export const clusterSize = (count: number) => Math.round(Math.min(56, 30 + 6 * Math.log10(Math.max(1, count))))
