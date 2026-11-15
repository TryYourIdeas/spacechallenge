import { randomUUID } from 'node:crypto'
import { config } from '../utils/config'
import { TASK_COLUMNS, publishTask, taskView, type TaskRow } from '../utils/events'
import { listCsvFiles } from '../utils/files'
import { fail } from '../utils/http'
import { log } from '../utils/log'
import { enqueueImport } from '../utils/queue'
import { getPool, getQueue, getRedis } from '../utils/services'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ file?: unknown }>(event)
  const name = body?.file
  if (typeof name !== 'string' || name.length < 1 || name.length > 255) throw fail(400, 'Send {"file": "<name>"}.')

  let files
  try { files = await listCsvFiles(config().sourceDir) } catch (e) {
    log('error', 'cannot list data directory', { err: (e as Error).message })
    throw fail(503, 'The data directory is not available.')
  }
  // Only exact names from the listing are accepted, so no path can be smuggled in.
  const file = files.find(f => f.name === name)
  if (!file) throw fail(404, 'That file is not in the data directory.')
  if (file.size === 0) throw fail(400, 'The file is empty.')

  const pool = getPool()
  const id = randomUUID()
  let row: TaskRow | undefined
  try {
    ({ rows: [row] } = await pool.query<TaskRow>(
      `INSERT INTO tasks (id, source_name, size_bytes) VALUES ($1, $2, $3) RETURNING ${TASK_COLUMNS}`,
      [id, file.name, file.size]))
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw fail(409, `${file.name} is already being imported.`)
    throw e
  }
  try {
    await enqueueImport(getQueue(), id)
  } catch (e) {
    log('error', 'enqueue failed', { taskId: id, err: (e as Error).message })
    ;({ rows: [row] } = await pool.query<TaskRow>(
      `UPDATE tasks SET status = 'failed', error = 'Import queue unavailable', updated_at = now()
       WHERE id = $1 RETURNING ${TASK_COLUMNS}`, [id]))
    if (row) await publishTask(getRedis(), row).catch(() => {})
    throw fail(503, 'Import queue unavailable. Please retry.')
  }
  await publishTask(getRedis(), row!).catch(() => {})
  log('info', 'import queued', { taskId: id, file: file.name })
  setResponseStatus(event, 202)
  setHeader(event, 'Location', `/api/tasks/${id}`)
  return taskView(row!)
})
