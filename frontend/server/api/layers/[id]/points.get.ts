import { parseBbox, parseFilterParam } from '../../../utils/clusters'
import { fail, idParam } from '../../../utils/http'
import { listPoints, MAX_LIST } from '../../../utils/points'
import { getPool } from '../../../utils/services'

// GET /api/layers/:id/points?bbox=...&filter=json — individual points in a (small) box, capped.
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const q = getQuery(event)
  const bbox = parseBbox(q.bbox)
  const filter = parseFilterParam(q.filter)
  if (!bbox) throw fail(400, 'bbox must be "west,south,east,north" in degrees.')
  if (filter === null) throw fail(400, 'filter is not a valid JSON filter payload.')
  return listPoints(getPool(), id, bbox, MAX_LIST, filter)
})
