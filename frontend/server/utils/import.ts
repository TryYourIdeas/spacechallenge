import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { Pool } from 'pg'
import { analyze, points, type Point } from './csv'

const PALETTE = [
  { color: '#4ADE80', shape: 'circle' },
  { color: '#FF6B9D', shape: 'diamond' },
  { color: '#FFD84A', shape: 'square' },
  { color: '#5EA8FF', shape: 'triangle' },
] as const
const BATCH = 1000

const labelOf = (name: string) => name.replace(/\.csv$/i, '') || 'Imported layer'

// Fixed project namespace: the same file name always maps to the same layer id.
const NAMESPACE = '6f1d5c1e-2b3a-5d4e-9a7b-3c0d8e2f4a11'

/** UUIDv5 of the file name, so re-importing a file replaces its layer instead of duplicating it. */
export function layerIdFor(fileName: string): string {
  const h = createHash('sha1')
    .update(Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')).update(fileName).digest()
  h[6] = (h[6]! & 0x0f) | 0x50
  h[8] = (h[8]! & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

export interface ImportResult { layerId: string; label: string; imported: number; skipped: number; replaced: boolean }

/**
 * Imports one CSV file into layers/layer_points in a single transaction (all or nothing).
 * Replay-safe: the layer id derives from the file name and the old layer is rewritten.
 */
export async function importCsvFile(
  pool: Pool, path: string, onProgress: (done: number, total: number | null) => void = () => {},
): Promise<ImportResult> {
  const fileName = basename(path)
  const layerId = layerIdFor(fileName)
  const label = labelOf(fileName)
  const a = await analyze(path, scanned => onProgress(scanned, null))
  onProgress(0, a.valid)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const del = await client.query('DELETE FROM layers WHERE id = $1', [layerId])
    const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM layers')
    const style = PALETTE[n % PALETTE.length]!
    await client.query(
      `INSERT INTO layers (id, label, color, shape, fields, row_count, skipped)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [layerId, label, style.color, style.shape, JSON.stringify(a.fields), a.valid, a.skipped])

    let batch: Point[] = []
    let done = 0
    const flush = async () => {
      if (!batch.length) return
      await client.query(
        `INSERT INTO layer_points (layer_id, row_idx, latitude, longitude, name, data)
         SELECT $1, * FROM unnest($2::int[], $3::float8[], $4::float8[], $5::text[], $6::jsonb[])`,
        [layerId, batch.map(p => p.idx), batch.map(p => p.latitude), batch.map(p => p.longitude),
          batch.map(p => p.name), batch.map(p => JSON.stringify(p.data))])
      done += batch.length
      batch = []
      onProgress(done, a.valid)
    }
    for await (const p of points(path, a)) {
      batch.push(p)
      if (batch.length >= BATCH) await flush()
    }
    await flush()
    await client.query('COMMIT')
    return { layerId, label, imported: a.valid, skipped: a.skipped, replaced: (del.rowCount ?? 0) > 0 }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
