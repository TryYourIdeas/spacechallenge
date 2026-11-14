import { join } from 'node:path'
import { analyze, points } from './csv.js'
import { TASK_COLUMNS } from './events.js'

const PALETTE = [
  { color: '#4ADE80', shape: 'circle' },
  { color: '#FF6B9D', shape: 'diamond' },
  { color: '#FFD84A', shape: 'square' },
  { color: '#5EA8FF', shape: 'triangle' },
]
const BATCH = 1000
const PROGRESS_EVERY_MS = 400

const labelOf = (name) => name.replace(/\.csv$/i, '') || 'Imported layer'

/**
 * Imports one CSV from the data directory into layers/layer_points in a single
 * transaction. Replay-safe: the layer shares the task's id and is rewritten.
 * `onTask(row)` receives the updated task row whenever its state/progress changes.
 */
export async function processImport(pool, taskId, { sourceDir, onTask = async () => {} }) {
  const { rows: [task] } = await pool.query(
    `UPDATE tasks SET status = 'processing', attempts = attempts + 1, error = NULL,
       progress_done = 0, progress_total = NULL, updated_at = now()
     WHERE id = $1 AND status <> 'done' RETURNING ${TASK_COLUMNS}`, [taskId])
  if (!task) return 'skipped'
  await onTask(task)

  let last = 0
  const progress = async (done, total, force = false) => {
    const now = Date.now()
    if (!force && now - last < PROGRESS_EVERY_MS) return
    last = now
    const { rows: [row] } = await pool.query(
      `UPDATE tasks SET progress_done = $2, progress_total = $3, updated_at = now()
       WHERE id = $1 RETURNING ${TASK_COLUMNS}`, [taskId, done, total])
    await onTask(row)
  }

  const path = join(sourceDir, task.source_name)
  const a = await analyze(path, scanned => progress(scanned, null))
  await progress(0, a.valid, true)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM layers WHERE id = $1', [taskId])
    const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM layers')
    const style = PALETTE[n % PALETTE.length]
    await client.query(
      `INSERT INTO layers (id, label, color, shape, fields, row_count, skipped)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [taskId, labelOf(task.source_name), style.color, style.shape, JSON.stringify(a.fields), a.valid, a.skipped])

    let batch = []
    let done = 0
    const flush = async () => {
      if (!batch.length) return
      await client.query(
        `INSERT INTO layer_points (layer_id, row_idx, latitude, longitude, name, data)
         SELECT $1, * FROM unnest($2::int[], $3::float8[], $4::float8[], $5::text[], $6::jsonb[])`,
        [taskId, batch.map(p => p.idx), batch.map(p => p.latitude), batch.map(p => p.longitude),
          batch.map(p => p.name), batch.map(p => JSON.stringify(p.data))])
      done += batch.length
      batch = []
      await progress(done, a.valid)
    }
    for await (const p of points(path, a)) {
      batch.push(p)
      if (batch.length >= BATCH) await flush()
    }
    await flush()
    const { rows: [final] } = await client.query(
      `UPDATE tasks SET status = 'done', error = NULL, imported_rows = $2, skipped_rows = $3,
         progress_done = $2, progress_total = $2, updated_at = now()
       WHERE id = $1 RETURNING ${TASK_COLUMNS}`, [taskId, a.valid, a.skipped])
    await client.query('COMMIT')
    await onTask(final)
    return 'done'
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function markFailed(pool, taskId, message) {
  const { rows: [row] } = await pool.query(
    `UPDATE tasks SET status = 'failed', error = $2, updated_at = now()
     WHERE id = $1 AND status <> 'done' RETURNING ${TASK_COLUMNS}`, [taskId, message])
  return row
}
