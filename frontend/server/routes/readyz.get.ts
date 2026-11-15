import { log } from '../utils/log'
import { getPool, getRedis } from '../utils/services'

export default defineEventHandler(async (event) => {
  try {
    await getPool().query('SELECT 1')
    await getRedis().ping()
    return { status: 'ready' }
  } catch (e) {
    log('error', 'not ready', { err: (e as Error).message })
    setResponseStatus(event, 503)
    return { status: 'unavailable' }
  }
})
