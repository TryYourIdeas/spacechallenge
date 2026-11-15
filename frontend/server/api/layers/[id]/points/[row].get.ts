import { parseRowIdx } from '../../../../utils/clusters'
import { fail, idParam } from '../../../../utils/http'
import { pointDetail } from '../../../../utils/points'
import { getPool } from '../../../../utils/services'

// GET /api/layers/:id/points/:row — every column of one point.
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const row = parseRowIdx(getRouterParam(event, 'row'))
  if (row === null) throw fail(400, 'Invalid point id.')
  const point = await pointDetail(getPool(), id, row)
  if (!point) throw fail(404, 'Point not found.')
  return point
})
