import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

export const QUEUE_NAME = 'csv-imports'

export const redisConnection = (url: string) => new Redis(url, { maxRetriesPerRequest: null })

export function createQueue(connection: Redis, attempts: number) {
  return new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400, count: 1000 },
    },
  })
}

/** jobId = task id, so enqueueing the same task twice is a no-op. */
export const enqueueImport = (queue: Queue, taskId: string) => queue.add('import', { importId: taskId }, { jobId: taskId })
