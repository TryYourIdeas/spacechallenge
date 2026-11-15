import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface DataFile { name: string; size: number; modifiedAt: string }

/** Regular, non-hidden *.csv files directly inside the data directory. */
export async function listCsvFiles(dir: string): Promise<DataFile[]> {
  const out: DataFile[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!e.isFile() || e.name.startsWith('.') || !/\.csv$/i.test(e.name)) continue
    const s = await stat(join(dir, e.name))
    out.push({ name: e.name, size: s.size, modifiedAt: s.mtime.toISOString() })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
