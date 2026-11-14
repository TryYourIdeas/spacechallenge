import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export const QUEUE_NAME = 'csv-imports'

export function redisConnection(url) {
  return new IORedis(url, { maxRetriesPerRequest: null })
}

export function createQueue(connection, attempts) {
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

/** jobId = import id, so enqueueing the same import twice is a no-op. */
export const enqueueImport = (queue, importId) => queue.add('import', { importId }, { jobId: importId })
