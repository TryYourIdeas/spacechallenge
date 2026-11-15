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

/** [[south, west], [north, east]] in degrees. */
export type LatLngBoundsTuple = [[number, number], [number, number]]

export interface Layer extends LayerMeta {
  fields: LayerField[]
  /** All rows for static layers. Empty for `remote` layers, whose points are fetched per viewport. */
  rows: LayerRow[]
  /** Rows dropped because their coordinates were missing or out of range. */
  skipped: number
  /** Set for layers stored on the server: only a summary is loaded. */
  remote?: { rowCount: number; bounds: LatLngBoundsTuple | null }
}

/** One grid cell from `/api/layers/:id/clusters`. `count` 1 is a single point with `id`. */
export interface ClusterItem {
  count: number
  latitude: number
  longitude: number
  bounds: LatLngBoundsTuple
  id?: string
  name?: string
}

export interface ClusterResponse {
  items: ClusterItem[]
  truncated: boolean
  filteredCount?: number
  filteredBounds?: LatLngBoundsTuple | null
}

export interface GlobalFilter {
  continent: string
  country: string
  distanceKm: number | null
  originLat: number | null
  originLon: number | null
  originLabel: string
  autoFit: boolean
}

export interface NumericRangeFilter {
  min: number | null
  max: number | null
}

export interface LayerFilter {
  mode: 'and' | 'or'
  hideMissing: boolean
  minerals: string[]
  similarityPreset: string
  similarityRange: NumericRangeFilter
  lunarGroup: string
  apolloMission: string
  ranges: Record<string, NumericRangeFilter>
  categories: Record<string, string>
}

/** A point from `/api/layers/:id/points` (no field values yet). */
export interface PointSummary { id: string; latitude: number; longitude: number; name?: string }

export interface SelectedPoint {
  layer: LayerMeta
  fields: LayerField[]
  row: LayerRow
  /** Remote points load their field values after selection. */
  status?: 'loading' | 'error'
  error?: string
}
