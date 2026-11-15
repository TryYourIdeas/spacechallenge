import { parseBbox } from '../../../utils/clusters'
import { fail, idParam } from '../../../utils/http'
import { listPoints } from '../../../utils/points'
import { getPool } from '../../../utils/services'

// GET /api/layers/:id/points?bbox=... — individual points in a (small) box, capped.
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const bbox = parseBbox(getQuery(event).bbox)
  if (!bbox) throw fail(400, 'bbox must be "west,south,east,north" in degrees.')
  return listPoints(getPool(), id, bbox)
})
