import { TASK_COLUMNS, taskView, type TaskRow } from '../utils/events'
import { fail } from '../utils/http'
import { log } from '../utils/log'
import { getHub, getPool } from '../utils/services'

// Server-Sent Events: one `snapshot` of recent tasks, then a `task` event per change.
export default defineEventHandler(async (event) => {
  const hub = await getHub()
  const stream = createEventStream(event)
  const client = {
    send: (name: string, data: unknown) => { void stream.push({ event: name, data: JSON.stringify(data) }) },
    end: () => { void stream.close() },
  }
  if (!hub.add(client)) throw fail(503, 'Too many live connections.')
  stream.onClosed(async () => {
    hub.remove(client)
    await stream.close()
  })
  try {
    const { rows } = await getPool().query<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY created_at DESC LIMIT 20`)
    client.send('snapshot', { tasks: rows.map(taskView) })
  } catch (e) {
    log('error', 'snapshot failed', { err: (e as Error).message })
    hub.remove(client)
    await stream.close()
  }
  return stream.send()
})
