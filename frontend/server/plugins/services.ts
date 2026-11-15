import { loadConfig } from '../utils/config'
import { migrate, waitForDb } from '../utils/db'
import { log } from '../utils/log'
import { closeServices, getPool } from '../utils/services'
import { startWorker } from '../utils/worker'

// Runs at server start: apply migrations, then (for the worker role) start consuming imports.
export default defineNitroPlugin(async (nitro) => {
  if (import.meta.prerender) return
  let cfg
  try { cfg = loadConfig() } catch (e) {
    // Lets `nuxt dev` work for UI-only changes; API routes will report the missing setting.
    log('warn', 'API disabled', { reason: (e as Error).message })
    return
  }
  const pool = getPool()
  await waitForDb(pool)
  await migrate(pool, cfg.migrationsDir)
  const stopWorker = cfg.role === 'web' ? undefined : startWorker()
  nitro.hooks.hook('close', async () => {
    log('info', 'shutting down')
    await stopWorker?.()
    await closeServices()
  })
})
