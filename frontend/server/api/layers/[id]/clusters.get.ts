import { parseBbox, parseFilterParam, parseZoom } from '../../../utils/clusters'
import { fail, idParam } from '../../../utils/http'
import { clusterPoints, MAX_ITEMS } from '../../../utils/points'
import { getPool } from '../../../utils/services'

// GET /api/layers/:id/clusters?bbox=west,south,east,north&zoom=z&filter=json
// Points inside the viewport, grouped into grid cells sized for that zoom level.
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const q = getQuery(event)
  const bbox = parseBbox(q.bbox)
  const zoom = parseZoom(q.zoom)
  const filter = parseFilterParam(q.filter)
  if (!bbox) throw fail(400, 'bbox must be "west,south,east,north" in degrees.')
  if (zoom === null) throw fail(400, 'zoom must be an integer from 0 to 22.')
  if (filter === null) throw fail(400, 'filter is not a valid JSON filter payload.')
  return clusterPoints(getPool(), id, bbox, zoom, MAX_ITEMS, filter)
})
