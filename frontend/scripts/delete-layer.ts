// Usage: npm run delete-layer -- <id-or-label> [--yes]
// Deletes one imported layer and its points from PostgreSQL (built-in layers are static
// files and cannot be deleted here). Asks for confirmation unless --yes is given.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { maskUrl, resolveDatabaseUrl } from '../server/utils/cli'
import { createPool } from '../server/utils/db'

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--')
  const yes = args.includes('--yes')
  const target = args.find(a => !a.startsWith('--'))
  if (!target || args.some(a => a.startsWith('--') && a !== '--yes')) throw new Error('Usage: npm run delete-layer -- <id-or-label> [--yes]')

  let envText = ''
  try { envText = readFileSync(resolve(process.cwd(), '../backend/docker/.env'), 'utf8') } catch { /* optional */ }
  const url = resolveDatabaseUrl(process.env, envText)
  console.error(`Database: ${maskUrl(url)}`)

  const pool = createPool(url)
  try {
    const { rows } = await pool.query(
      `SELECT id, label, row_count FROM layers WHERE label = $1 OR id::text = $1 ORDER BY created_at, id`, [target])
    if (!rows.length) throw new Error(`No imported layer with id or label "${target}" (run scripts/list_layers.sh).`)
    if (rows.length > 1) throw new Error(`"${target}" matches ${rows.length} layers; use the id: ${rows.map(r => r.id).join(', ')}`)
    const layer = rows[0]!

    if (!yes) {
      if (!process.stdin.isTTY) throw new Error('Refusing to delete without confirmation; pass --yes in non-interactive use.')
      const rl = createInterface({ input: process.stdin, output: process.stderr })
      const answer = await rl.question(`Delete layer "${layer.label}" (${layer.id}, ${layer.row_count.toLocaleString('en-US')} rows)? This cannot be undone. [y/N] `)
      rl.close()
      if (!/^y(es)?$/i.test(answer.trim())) { console.log('Cancelled; nothing deleted.'); return }
    }

    // layer_points rows are removed by ON DELETE CASCADE in the same statement.
    const del = await pool.query('DELETE FROM layers WHERE id = $1', [layer.id])
    console.log(`Deleted layer "${layer.label}" (${layer.id}, ${layer.row_count.toLocaleString('en-US')} rows)${del.rowCount ? '' : ' - already gone'}`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
