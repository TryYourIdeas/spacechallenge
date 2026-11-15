// Usage: npm run layers
// Read-only: lists the built-in layers (public/data/layers.json) and the layers
// imported into PostgreSQL. Without a reachable database only built-ins are shown.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { formatLayerTable, maskUrl, resolveDatabaseUrl, type LayerRow } from '../server/utils/cli'
import { createPool } from '../server/utils/db'

async function main() {
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/layers.json'), 'utf8')) as { layers: Array<{ id: string; label: string; shape: string; color: string }> }
  const layers: LayerRow[] = manifest.layers.map(l => ({ source: 'built-in', id: l.id, label: l.label, shape: l.shape, color: l.color, rows: null }))

  let failure = ''
  let envText = ''
  try { envText = readFileSync(resolve(process.cwd(), '../backend/docker/.env'), 'utf8') } catch { /* optional */ }
  try {
    const url = resolveDatabaseUrl(process.env, envText)
    console.error(`Database: ${maskUrl(url)}`)
    const pool = createPool(url)
    try {
      const { rows } = await pool.query('SELECT id, label, color, shape, row_count FROM layers ORDER BY created_at, id')
      for (const r of rows) layers.push({ source: 'imported', id: r.id, label: r.label, shape: r.shape, color: r.color, rows: r.row_count })
    } catch (e) {
      // 42P01: migrations not applied yet, so nothing has been imported.
      if ((e as { code?: string }).code !== '42P01') throw e
    } finally {
      await pool.end()
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e)
  }

  console.log(formatLayerTable(layers))
  if (failure) {
    console.error(`Imported layers unavailable: ${failure}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(`Listing failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
