import { fail, idParam } from '../../utils/http'
import { getPool } from '../../utils/services'

export default defineEventHandler(async (event) => {
  const { rows: [l] } = await getPool().query('DELETE FROM layers WHERE id = $1 RETURNING id', [idParam(event)])
  if (!l) throw fail(404, 'Layer not found.')
  setResponseStatus(event, 204)
  return null
})
