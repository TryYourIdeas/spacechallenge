import type { Redis } from 'ioredis'
import { CHANNEL } from './events'

const MAX_CLIENTS = 200

export interface SseClient {
  send(event: string, data: unknown): void
  end?(): void
}

/** Fans Redis pub/sub task events out to connected SSE clients (dedicated subscriber connection). */
export async function createHub(redis: Pick<Redis, 'duplicate'>) {
  const sub = redis.duplicate()
  const clients = new Set<SseClient>()
  sub.on('message', (_channel: string, message: string) => {
    let task: unknown
    try { task = JSON.parse(message) } catch { return }
    for (const c of clients) c.send('task', task)
  })
  await sub.subscribe(CHANNEL)
  const beat = setInterval(() => { for (const c of clients) c.send('ping', {}) }, 15_000)
  beat.unref()
  return {
    get size() { return clients.size },
    add(client: SseClient) {
      if (clients.size >= MAX_CLIENTS) return false
      clients.add(client)
      return true
    },
    remove(client: SseClient) { clients.delete(client) },
    async close() {
      clearInterval(beat)
      for (const c of clients) c.end?.()
      clients.clear()
      sub.disconnect()
    },
  }
}
export type Hub = Awaited<ReturnType<typeof createHub>>
