import { log } from '../utils/log'
import { getPool } from '../utils/services'

export default defineEventHandler(async (event) => {
  try {
    await getPool().query('SELECT 1')
    return { status: 'ready' }
  } catch (e) {
    log('error', 'not ready', { err: (e as Error).message })
    setResponseStatus(event, 503)
    return { status: 'unavailable' }
  }
})
