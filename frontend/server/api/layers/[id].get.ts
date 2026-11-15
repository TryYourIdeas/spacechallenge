import { fail, idParam } from '../../utils/http'
import { layerSummary } from '../../utils/points'
import { getPool } from '../../utils/services'

// Layer metadata only (columns, counts, extent). Points are fetched per viewport via /clusters
// and one at a time via /points/:row, so large layers never travel as a whole.
export default defineEventHandler(async (event) => {
  const summary = await layerSummary(getPool(), idParam(event))
  if (!summary) throw fail(404, 'Layer not found.')
  return summary
})
