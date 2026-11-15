import { parseBbox, parseZoom } from '../../../utils/clusters'
import { fail, idParam } from '../../../utils/http'
import { clusterPoints } from '../../../utils/points'
import { getPool } from '../../../utils/services'

// GET /api/layers/:id/clusters?bbox=west,south,east,north&zoom=z
// Points inside the viewport, grouped into grid cells sized for that zoom level.
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const q = getQuery(event)
  const bbox = parseBbox(q.bbox)
  const zoom = parseZoom(q.zoom)
  if (!bbox) throw fail(400, 'bbox must be "west,south,east,north" in degrees.')
  if (zoom === null) throw fail(400, 'zoom must be an integer from 0 to 22.')
  return clusterPoints(getPool(), id, bbox, zoom)
})
