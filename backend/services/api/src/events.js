export const CHANNEL = 'task-events'

export const TASK_COLUMNS = `id, kind, source_name, status, progress_done, progress_total,
  imported_rows, skipped_rows, error, created_at, updated_at`

/** Public shape of a task row, used by REST responses and SSE events. */
export const taskView = (r) => ({
  id: r.id,
  kind: r.kind,
  sourceName: r.source_name,
  status: r.status,
  progressDone: Number(r.progress_done ?? 0),
  progressTotal: r.progress_total == null ? null : Number(r.progress_total),
  importedRows: r.imported_rows ?? null,
  skippedRows: r.skipped_rows ?? null,
  error: r.error ?? null,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
})

export const publishTask = (redis, row) => redis.publish(CHANNEL, JSON.stringify(taskView(row)))
