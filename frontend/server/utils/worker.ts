import { closeSync, openSync, utimesSync } from 'node:fs'
import { Worker, UnrecoverableError } from 'bullmq'
import { config } from './config'
import { ImportError } from './csv'
import { publishTask } from './events'
import { markFailed, processImport } from './import'
import { log } from './log'
import { QUEUE_NAME, enqueueImport } from './queue'
import { getPool, getQueue, getRedis } from './services'

/** Starts the BullMQ consumer, the stale-task sweep and the liveness heartbeat. Returns a stop function. */
export function startWorker(): () => Promise<void> {
  const cfg = config()
  const pool = getPool()
  const connection = getRedis()
  const queue = getQueue()

  const worker = new Worker(QUEUE_NAME, async (job) => {
    const taskId = (job.data as { importId: string }).importId
    const started = Date.now()
    const onTask = (row: Parameters<typeof publishTask>[1]) =>
      publishTask(connection, row).catch(e => log('warn', 'publish failed', { err: (e as Error).message }))
    const result = await processImport(pool, taskId, { sourceDir: cfg.sourceDir, onTask })
    log('info', 'import finished', { taskId, result, attempt: job.attemptsMade + 1, ms: Date.now() - started })
  }, { connection, concurrency: 2 })

  worker.on('failed', async (job, err) => {
    if (!job) return
    const taskId = (job.data as { importId: string }).importId
    const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1)
    log('error', 'import attempt failed', { taskId, attempt: job.attemptsMade, final, err: err.message })
    if (!final) return
    const msg = err instanceof ImportError ? err.message : 'Import failed due to a server error. Please retry.'
    try {
      const row = await markFailed(pool, taskId, msg)
      if (row) await publishTask(connection, row)
    } catch (e) { log('error', 'could not record failure', { taskId, err: (e as Error).message }) }
  })
  worker.on('error', err => log('error', 'worker error', { err: err.message }))

  // Re-enqueue tasks whose queue entry was lost (crash between insert and enqueue, Redis flush).
  // Same jobId makes this a no-op for jobs BullMQ still knows about.
  async function requeueStale() {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM tasks WHERE status IN ('queued', 'processing')
       AND updated_at < now() - make_interval(secs => $1)`, [cfg.staleAfterSeconds])
    for (const { id } of rows) {
      await enqueueImport(queue, id).catch(e => log('error', 'requeue failed', { taskId: id, err: (e as Error).message }))
    }
    if (rows.length) log('info', 'requeued stale tasks', { count: rows.length })
  }
  void requeueStale().catch(() => {})
  const sweep = setInterval(() => void requeueStale().catch(() => {}), 60_000)

  const beat = () => {
    const t = new Date()
    try { utimesSync('/tmp/heartbeat', t, t) } catch { try { closeSync(openSync('/tmp/heartbeat', 'w')) } catch { /* no /tmp */ } }
  }
  beat()
  const hb = setInterval(beat, 10_000)
  log('info', 'worker started')

  return async () => {
    clearInterval(sweep); clearInterval(hb)
    await worker.close()
  }
}
