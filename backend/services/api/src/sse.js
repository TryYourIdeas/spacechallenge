import { CHANNEL } from './events.js'

const MAX_CLIENTS = 200

export const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * Fans Redis pub/sub task events out to connected SSE clients.
 * `redis` is only used to `duplicate()` a dedicated subscriber connection.
 */
export async function createHub(redis) {
  const sub = redis.duplicate()
  const clients = new Set()
  sub.on('message', (_channel, message) => {
    let task
    try { task = JSON.parse(message) } catch { return }
    for (const c of clients) c.write(frame('task', task))
  })
  await sub.subscribe(CHANNEL)
  const beat = setInterval(() => { for (const c of clients) c.write(': keep-alive\n\n') }, 15_000)
  beat.unref()

  return {
    get size() { return clients.size },
    /** Registers a writable (has .write) client; returns false if at capacity. */
    add(client) {
      if (clients.size >= MAX_CLIENTS) return false
      clients.add(client)
      return true
    },
    remove(client) { clients.delete(client) },
    async close() {
      clearInterval(beat)
      for (const c of clients) c.end?.()
      clients.clear()
      sub.disconnect()
    },
  }
}
