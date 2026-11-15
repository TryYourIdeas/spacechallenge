import type { Pool } from 'pg'
import { config } from './config'
import { createPool } from './db'

// Lazily created, process-wide connection pool shared by routes and shutdown.
let pool: Pool | undefined

export const getPool = () => (pool ??= createPool(config().databaseUrl))

export async function closeServices() {
  await pool?.end()
  pool = undefined
}
