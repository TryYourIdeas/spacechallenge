import { loadConfig } from './config.js'
import { createPool, migrate, waitForDb } from './db.js'
import { createQueue, redisConnection } from './queue.js'
import { buildApp } from './app.js'
import { log } from './log.js'

const config = loadConfig()
const pool = createPool(config.databaseUrl)
await waitForDb(pool)
await migrate(pool, config.migrationsDir)
const redis = redisConnection(config.queueUrl)
const queue = createQueue(redis, config.importAttempts)
const app = await buildApp({ pool, queue, redis, config })

let closing = false
const shutdown = async (sig) => {
  if (closing) return
  closing = true
  log('info', 'shutting down', { sig })
  await app.close()
  await queue.close()
  redis.disconnect()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

await app.listen({ host: '0.0.0.0', port: config.port })
