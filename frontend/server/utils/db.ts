import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

export const createPool = (databaseUrl: string) => new pg.Pool({ connectionString: databaseUrl, max: 8 })

/** Applies migrations/*.sql once each, in name order, serialized by an advisory lock. */
export async function migrate(pool: pg.Pool, dir: string) {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(727001)')
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name as string))
    for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
      if (done.has(f)) continue
      await client.query('BEGIN')
      try {
        await client.query(await readFile(join(dir, f), 'utf8'))
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {})
    client.release()
  }
}

export async function waitForDb(pool: pg.Pool, tries = 30) {
  for (let i = 0; ; i++) {
    try { await pool.query('SELECT 1'); return } catch (e) {
      if (i >= tries) throw e
      await new Promise(r => setTimeout(r, 1000))
    }
  }
}
