import { TASK_COLUMNS, taskView, type TaskRow } from '../../utils/events'
import { getPool } from '../../utils/services'

export default defineEventHandler(async () => {
  const { rows } = await getPool().query<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY created_at DESC LIMIT 50`)
  return { tasks: rows.map(taskView) }
})
