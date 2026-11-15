import { loadConfig } from '../utils/config'
import { migrate, waitForDb } from '../utils/db'
import { log } from '../utils/log'
import { closeServices, getPool } from '../utils/services'

// Runs at server start: apply migrations (Docker/VM only).
export default defineNitroPlugin(async (nitro) => {
  if (import.meta.prerender) return
  let cfg
  try { cfg = loadConfig() } catch (e) {
    // Lets `nuxt dev` work for UI-only changes; API routes will report the missing setting.
    log('warn', 'API disabled', { reason: (e as Error).message })
    return
  }
  // Serverless (Vercel) has no migration files and no shutdown hook: it only reads. Migrations
  // are applied by the Docker `app` service or by `npm run import`.
  if (process.env.VERCEL) return
  const pool = getPool()
  await waitForDb(pool)
  await migrate(pool, cfg.migrationsDir)
  nitro.hooks.hook('close', async () => {
    log('info', 'shutting down')
    await closeServices()
  })
})
