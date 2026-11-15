// Usage: npm run import -- <file.csv>
// Imports a CSV into PostgreSQL (layers + layer_points). Re-importing the same file name replaces its layer.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { maskUrl, resolveDatabaseUrl, validateCsvPath } from '../server/utils/cli'
import { createPool, migrate } from '../server/utils/db'
import { importCsvFile } from '../server/utils/import'

async function main() {
  const arg = process.argv.slice(2).find(a => a !== '--')
  if (!arg) throw new Error('Usage: npm run import -- <file.csv>')
  const file = await validateCsvPath(arg)

  let envText = ''
  try { envText = readFileSync(resolve(process.cwd(), '../backend/docker/.env'), 'utf8') } catch { /* optional */ }
  const url = resolveDatabaseUrl(process.env, envText)
  console.error(`Database: ${maskUrl(url)}`)

  const pool = createPool(url)
  try {
    // Idempotent; makes a brand-new database importable.
    await migrate(pool, resolve(process.cwd(), '../backend/services/database/migrations'))
    let last = 0
    const r = await importCsvFile(pool, file, (done, total) => {
      const now = Date.now()
      if (now - last < 500) return
      last = now
      process.stderr.write(`\r${total === null ? `scanned ${done.toLocaleString('en-US')} rows` : `imported ${done.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`}   `)
    })
    process.stderr.write('\r' + ' '.repeat(50) + '\r')
    console.log(`Imported ${r.imported.toLocaleString('en-US')} rows (${r.skipped.toLocaleString('en-US')} skipped) into layer "${r.label}" [${r.replaced ? 'replaced' : 'new'}]`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
