import { createReadStream } from 'node:fs'
import { parse } from 'csv-parse'
import { UnrecoverableError } from 'bullmq'

/** A problem with the uploaded file itself; retrying cannot help. Message is user-safe. */
export class ImportError extends UnrecoverableError {}

const LAT = ['lat', 'latitude', 'latitud']
const LON = ['lon', 'lng', 'long', 'longitude', 'longitud']
const NAME = ['name', 'sample_name', 'title', 'id']
const MAX_COLUMNS = 500
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

export function parseNumber(raw) {
  const s = (raw ?? '').trim()
  if (!NUMBER.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export const validCoordinate = (lat, lon) =>
  lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180

const col = (headers, names) => headers.findIndex(h => names.includes(h.trim().toLowerCase()))

export function records(path) {
  return createReadStream(path).pipe(parse({
    bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, skip_records_with_empty_values: true,
  }))
}

const wrap = (e) => {
  if (e instanceof ImportError) return e
  if (e?.code?.startsWith?.('CSV_')) return new ImportError(`The file is not valid CSV (${e.message}).`)
  return e
}

/** Pass 1: find the lat/lon columns, infer column types, count valid and skipped rows. */
export async function analyze(path, onScan = () => {}) {
  let headers, latCol, lonCol, nameCol, numeric, nonEmpty
  let valid = 0, skipped = 0
  try {
    for await (const r of records(path)) {
      if (!headers) {
        headers = r.map(h => h.trim())
        if (headers.length > MAX_COLUMNS) throw new ImportError(`Too many columns (limit ${MAX_COLUMNS}).`)
        latCol = col(headers, LAT)
        lonCol = col(headers, LON)
        if (latCol < 0 || lonCol < 0) {
          throw new ImportError('Could not find a latitude column ("lat") and a longitude column ("lon").')
        }
        const n = NAME.map(x => headers.findIndex(h => h.toLowerCase() === x)).find(i => i >= 0)
        nameCol = n
        numeric = headers.map(() => true)
        nonEmpty = headers.map(() => 0)
        continue
      }
      if ((valid + skipped) % 5000 === 0) await onScan(valid + skipped)
      headers.forEach((_, i) => {
        const v = (r[i] ?? '').trim()
        if (v === '') return
        nonEmpty[i]++
        if (numeric[i] && parseNumber(v) === null) numeric[i] = false
      })
      if (validCoordinate(parseNumber(r[latCol]), parseNumber(r[lonCol]))) valid++
      else skipped++
    }
  } catch (e) { throw wrap(e) }
  if (!headers) throw new ImportError('The file is empty.')
  if (valid === 0) throw new ImportError('No rows had valid latitude/longitude values.')
  const fields = headers.map((h, i) => ({
    key: `c${i}`, label: h || `Column ${i + 1}`,
    type: nonEmpty[i] > 0 && numeric[i] ? 'number' : 'string',
  }))
  return { headers, fields, latCol, lonCol, nameCol, valid, skipped }
}

/** Pass 2: yield one DB-ready point per valid row. `idx` is the 0-based data-row index. */
export async function* points(path, a) {
  let first = true
  let idx = -1
  try {
    for await (const r of records(path)) {
      if (first) { first = false; continue }
      idx++
      const latitude = parseNumber(r[a.latCol])
      const longitude = parseNumber(r[a.lonCol])
      if (!validCoordinate(latitude, longitude)) continue
      const data = {}
      a.fields.forEach((f, i) => {
        const v = (r[i] ?? '').trim()
        data[f.key] = v === '' ? null : f.type === 'number' ? parseNumber(v) : v
      })
      const name = a.nameCol !== undefined ? (r[a.nameCol] ?? '').trim() || null : null
      yield { idx, latitude, longitude, name, data }
    }
  } catch (e) { throw wrap(e) }
}
