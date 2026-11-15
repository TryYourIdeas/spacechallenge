import type { Pool } from 'pg'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { config } from './config'
import { createPool } from './db'
import { createQueue, redisConnection } from './queue'
import { createHub, type Hub } from './sse'

// Lazily created, process-wide connections shared by routes, the worker and shutdown.
let pool: Pool | undefined
let redis: Redis | undefined
let queue: Queue | undefined
let hub: Promise<Hub> | undefined

export const getPool = () => (pool ??= createPool(config().databaseUrl))
export const getRedis = () => (redis ??= redisConnection(config().queueUrl))
export const getQueue = () => (queue ??= createQueue(getRedis(), config().importAttempts))
export function getHub(): Promise<Hub> {
  hub ??= createHub(getRedis()).catch((e) => { hub = undefined; throw e })
  return hub
}

export async function closeServices() {
  if (hub) await (await hub.catch(() => undefined))?.close()
  await queue?.close()
  redis?.disconnect()
  await pool?.end()
  pool = redis = queue = hub = undefined
}
