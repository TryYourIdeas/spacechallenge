import { TASK_COLUMNS, taskView, type TaskRow } from '../../utils/events'
import { fail, idParam } from '../../utils/http'
import { getPool } from '../../utils/services'

export default defineEventHandler(async (event) => {
  const { rows: [t] } = await getPool().query<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`, [idParam(event)])
  if (!t) throw fail(404, 'Task not found.')
  return taskView(t)
})
