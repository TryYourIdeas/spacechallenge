// Usage: npm run migrate
// Applies pending database migrations to the PostgreSQL named by DATABASE_URL (environment,
// else backend/docker/.env). Idempotent. Needed for hosts that skip migrations at startup (Vercel).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { maskUrl, resolveDatabaseUrl } from '../server/utils/cli'
import { createPool, migrate } from '../server/utils/db'

async function main() {
  let envText = ''
  try { envText = readFileSync(resolve(process.cwd(), '../backend/docker/.env'), 'utf8') } catch { /* optional */ }
  const url = resolveDatabaseUrl(process.env, envText)
  console.error(`Database: ${maskUrl(url)}`)
  const pool = createPool(url)
  try {
    const before = await pool.query('SELECT name FROM schema_migrations').then(r => new Set(r.rows.map(x => x.name as string)), () => new Set<string>())
    await migrate(pool, resolve(process.cwd(), '../backend/services/database/migrations'))
    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name')
    const added = rows.map(r => r.name as string).filter(n => !before.has(n))
    console.log(added.length ? `Applied: ${added.join(', ')}` : 'Already up to date.')
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(`Migration failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
