import type { Redis } from 'ioredis'

export const CHANNEL = 'task-events'

export const TASK_COLUMNS = `id, kind, source_name, status, progress_done, progress_total,
  imported_rows, skipped_rows, error, created_at, updated_at`

export interface TaskRow {
  id: string; kind: string; source_name: string; status: string
  progress_done: string | number | null; progress_total: string | number | null
  imported_rows: number | null; skipped_rows: number | null; error: string | null
  created_at: string | Date; updated_at: string | Date
}

/** Public shape of a task row, used by REST responses and SSE events. */
export const taskView = (r: TaskRow) => ({
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

export const publishTask = (redis: Redis, row: TaskRow) => redis.publish(CHANNEL, JSON.stringify(taskView(row)))
