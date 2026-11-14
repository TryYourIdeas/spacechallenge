import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import { enqueueImport } from './queue.js'
import { listCsvFiles } from './files.js'
import { TASK_COLUMNS, publishTask, taskView } from './events.js'
import { createHub, frame } from './sse.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const idSchema = { params: { type: 'object', properties: { id: { type: 'string', pattern: UUID.source } } } }
const importSchema = {
  body: {
    type: 'object', required: ['file'], additionalProperties: false,
    properties: { file: { type: 'string', minLength: 1, maxLength: 255 } },
  },
}

/** Builds the HTTP app. `deps` = { pool, queue, redis, config }; injectable for tests. */
export async function buildApp({ pool, queue, redis, config }, opts = {}) {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 4096 })
  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST', 'DELETE'] })
  await app.register(compress)
  const hub = await createHub(redis)
  app.addHook('onClose', async () => hub.close())

  app.get('/healthz', async () => ({ status: 'ok' }))
  app.get('/readyz', async (_req, reply) => {
    try {
      await pool.query('SELECT 1')
      await redis.ping()
      return { status: 'ready' }
    } catch (e) {
      app.log.error({ err: e }, 'not ready')
      return reply.code(503).send({ status: 'unavailable' })
    }
  })

  // CSV files the user may import: the server's data directory, nothing else.
  app.get('/api/files', async (req, reply) => {
    try {
      return { files: await listCsvFiles(config.sourceDir) }
    } catch (e) {
      req.log.error({ err: e }, 'cannot list data directory')
      return reply.code(503).send({ error: 'The data directory is not available.' })
    }
  })

  app.post('/api/imports', { schema: importSchema }, async (req, reply) => {
    let files
    try { files = await listCsvFiles(config.sourceDir) } catch (e) {
      req.log.error({ err: e }, 'cannot list data directory')
      return reply.code(503).send({ error: 'The data directory is not available.' })
    }
    // Only exact names from the listing are accepted, so no path can be smuggled in.
    const file = files.find(f => f.name === req.body.file)
    if (!file) return reply.code(404).send({ error: 'That file is not in the data directory.' })
    if (file.size === 0) return reply.code(400).send({ error: 'The file is empty.' })

    const id = randomUUID()
    let row
    try {
      ({ rows: [row] } = await pool.query(
        `INSERT INTO tasks (id, source_name, size_bytes) VALUES ($1, $2, $3) RETURNING ${TASK_COLUMNS}`,
        [id, file.name, file.size]))
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: `${file.name} is already being imported.` })
      throw e
    }
    try {
      await enqueueImport(queue, id)
    } catch (e) {
      req.log.error({ err: e, taskId: id }, 'enqueue failed')
      ;({ rows: [row] } = await pool.query(
        `UPDATE tasks SET status = 'failed', error = 'Import queue unavailable', updated_at = now()
         WHERE id = $1 RETURNING ${TASK_COLUMNS}`, [id]))
      await publishTask(redis, row).catch(() => {})
      return reply.code(503).send({ error: 'Import queue unavailable. Please retry.' })
    }
    await publishTask(redis, row).catch(() => {})
    req.log.info({ taskId: id, file: file.name }, 'import queued')
    return reply.code(202).header('Location', `/api/tasks/${id}`).send(taskView(row))
  })

  app.get('/api/tasks', async () => {
    const { rows } = await pool.query(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY created_at DESC LIMIT 50`)
    return { tasks: rows.map(taskView) }
  })

  app.get('/api/tasks/:id', { schema: idSchema }, async (req, reply) => {
    const { rows: [t] } = await pool.query(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`, [req.params.id])
    return t ? taskView(t) : reply.code(404).send({ error: 'Task not found.' })
  })

  // Server-sent events: a `snapshot` of recent tasks, then a `task` event per change.
  app.get('/api/events', async (req, reply) => {
    const res = reply.raw
    const client = { write: (chunk) => res.write(chunk), end: () => res.end() }
    if (!hub.add(client)) return reply.code(503).send({ error: 'Too many live connections.' })
    reply.hijack()
    res.on('close', () => hub.remove(client))
    res.writeHead(200, {
      ...reply.getHeaders(),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 3000\n\n')
    try {
      const { rows } = await pool.query(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY created_at DESC LIMIT 20`)
      res.write(frame('snapshot', { tasks: rows.map(taskView) }))
    } catch (e) {
      req.log.error({ err: e }, 'snapshot failed')
      res.end()
    }
  })

  app.get('/api/layers', async () => {
    const { rows } = await pool.query('SELECT id, label, color, shape, created_at FROM layers ORDER BY created_at, id')
    return { layers: rows.map(r => ({
      id: r.id, label: r.label, color: r.color, shape: r.shape,
      description: `Imported from ${r.label}.csv`, source: `/api/layers/${r.id}`, imported: true,
    })) }
  })

  app.get('/api/layers/:id', { schema: idSchema }, async (req, reply) => {
    const { rows: [l] } = await pool.query('SELECT fields, skipped FROM layers WHERE id = $1', [req.params.id])
    if (!l) return reply.code(404).send({ error: 'Layer not found.' })
    const { rows } = await pool.query(
      'SELECT row_idx, latitude, longitude, name, data FROM layer_points WHERE layer_id = $1 ORDER BY row_idx',
      [req.params.id])
    return {
      fields: l.fields, skipped: l.skipped,
      rows: rows.map(r => ({
        id: String(r.row_idx), latitude: r.latitude, longitude: r.longitude,
        ...(r.name ? { name: r.name } : {}), ...r.data,
      })),
    }
  })

  app.delete('/api/layers/:id', { schema: idSchema }, async (req, reply) => {
    const { rows: [l] } = await pool.query('DELETE FROM layers WHERE id = $1 RETURNING id', [req.params.id])
    if (!l) return reply.code(404).send({ error: 'Layer not found.' })
    return reply.code(204).send()
  })

  return app
}
