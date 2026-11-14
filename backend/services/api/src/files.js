import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Regular, non-hidden *.csv files directly inside the data directory. */
export async function listCsvFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const out = []
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.') || !/\.csv$/i.test(e.name)) continue
    const s = await stat(join(dir, e.name))
    out.push({ name: e.name, size: s.size, modifiedAt: s.mtime.toISOString() })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
