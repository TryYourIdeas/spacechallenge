import type { Pool } from 'pg'
import { config } from './config'
import { createPool } from './db'

// Lazily created, process-wide connection pool shared by routes and shutdown.
let pool: Pool | undefined

/** API limits (see createPool): below the ~15 s a serverless request may run. */
export const API_STATEMENT_TIMEOUT_MS = 12_000
export const API_CONNECTION_TIMEOUT_MS = 5_000

export const getPool = () => (pool ??= createPool(config().databaseUrl, {
  statementTimeoutMs: API_STATEMENT_TIMEOUT_MS,
  connectionTimeoutMs: API_CONNECTION_TIMEOUT_MS,
}))

export async function closeServices() {
  await pool?.end()
  pool = undefined
}
