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
