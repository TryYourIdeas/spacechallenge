import { closeSync, openSync, utimesSync } from 'node:fs'
import { Worker, UnrecoverableError } from 'bullmq'
import { loadConfig } from './config.js'
import { createPool, migrate, waitForDb } from './db.js'
import { QUEUE_NAME, createQueue, enqueueImport, redisConnection } from './queue.js'
import { markFailed, processImport } from './import.js'
import { ImportError } from './csv.js'
import { publishTask } from './events.js'
import { log } from './log.js'

const config = loadConfig()
const pool = createPool(config.databaseUrl)
await waitForDb(pool)
await migrate(pool, config.migrationsDir)
const connection = redisConnection(config.queueUrl)
const queue = createQueue(connection, config.importAttempts)

const worker = new Worker(QUEUE_NAME, async (job) => {
  const { importId } = job.data
  const started = Date.now()
  const onTask = (row) => publishTask(connection, row).catch(e => log('warn', 'publish failed', { err: e.message }))
  const result = await processImport(pool, importId, { sourceDir: config.sourceDir, onTask })
  log('info', 'import finished', { importId, result, attempt: job.attemptsMade + 1, ms: Date.now() - started })
}, { connection, concurrency: 2 })

worker.on('failed', async (job, err) => {
  if (!job) return
  const { importId } = job.data
  const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1)
  log('error', 'import attempt failed', { importId, attempt: job.attemptsMade, final, err: err.message })
  if (final) {
    const msg = err instanceof ImportError ? err.message : 'Import failed due to a server error. Please retry.'
    await markFailed(pool, importId, msg)
      .then(row => row && publishTask(connection, row))
      .catch(e => log('error', 'could not record failure', { importId, err: e.message }))
  }
})
worker.on('error', err => log('error', 'worker error', { err: err.message }))

// Re-enqueue jobs whose queue entry was lost (crash between insert and enqueue, Redis flush).
// Same jobId makes this a no-op for jobs BullMQ still knows about.
async function requeueStale() {
  const { rows } = await pool.query(
    `SELECT id FROM tasks WHERE status IN ('queued', 'processing')
     AND updated_at < now() - make_interval(secs => $1)`, [config.staleAfterSeconds])
  for (const { id } of rows) {
    await enqueueImport(queue, id).catch(e => log('error', 'requeue failed', { importId: id, err: e.message }))
  }
  if (rows.length) log('info', 'requeued stale imports', { count: rows.length })
}
await requeueStale()
const sweep = setInterval(() => requeueStale().catch(() => {}), 60_000)

// Liveness heartbeat for the container health check.
const beat = () => { const t = new Date(); try { utimesSync('/tmp/heartbeat', t, t) } catch { closeSync(openSync('/tmp/heartbeat', 'w')) } }
beat()
const hb = setInterval(beat, 10_000)

let closing = false
const shutdown = async (sig) => {
  if (closing) return
  closing = true
  log('info', 'worker shutting down', { sig })
  clearInterval(sweep); clearInterval(hb)
  await worker.close()
  await queue.close()
  connection.disconnect()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
log('info', 'worker started')
