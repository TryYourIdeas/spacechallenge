export type FieldType = 'string' | 'number' | 'date'

export interface LayerField {
  key: string
  label: string
  type: FieldType
  unit?: string
}

/** One table row. `latitude`/`longitude` are WGS84 decimal degrees. */
export interface LayerRow {
  id: string
  latitude: number
  longitude: number
  [field: string]: string | number | null
}

export interface LayerMeta {
  id: string
  label: string
  description: string
  /** Marker shape so layers differ by more than color. */
  shape: 'circle' | 'square' | 'diamond' | 'triangle'
  color: string
  /** Path of the table JSON, relative to the data base URL. */
  source: string
  /** True for layers the user imported from a local CSV file. */
  imported?: boolean
}

export interface Layer extends LayerMeta {
  fields: LayerField[]
  rows: LayerRow[]
  /** Rows dropped because their coordinates were missing or out of range. */
  skipped: number
}

export interface SelectedPoint {
  layer: LayerMeta
  fields: LayerField[]
  row: LayerRow
}

export type TaskStatus = 'queued' | 'processing' | 'done' | 'failed'

/** A server-side background task (CSV import), as sent by the API and its SSE stream. */
export interface ServerTask {
  id: string
  kind: string
  sourceName: string
  status: TaskStatus
  progressDone: number
  /** null while the file is still being scanned and the row count is unknown. */
  progressTotal: number | null
  importedRows: number | null
  skippedRows: number | null
  error: string | null
  createdAt: string
  updatedAt: string
}

/** A CSV file available in the server's data directory. */
export interface DataFile {
  name: string
  size: number
  modifiedAt: string
}
