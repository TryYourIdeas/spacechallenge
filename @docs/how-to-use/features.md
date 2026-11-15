# Features

What Layer Explorer does today. Keep this list in step with the code.

## Map and layers

- Interactive Leaflet world map on a dark, deep-space themed UI (Geist
  typography; Arctic Cyan and Royal Purple highlights).
- Built-in static layers are loaded from `frontend/public/data/`, defined in
  `layers.json` (id, label, description, marker shape, `#RRGGBB` colour, source
  table). The manifest is currently empty; the old sample tables
  (`launch-sites.json`, `ground-stations.json`, `meteorites.json`) remain on disk
  but are not listed. Layers come from CSV imports.
- Distinct marker shape and colour per layer; per-layer visibility toggles. All layers start hidden when the app opens; the map says so until one is ticked.
- Per-layer status: point count, skipped invalid rows, loading and error states
  with retry.
- Clicking a point opens a closeable dialog on the right of the map with all its fields (close with the × button, Close, or Esc).

## Loading feedback and limits

- When a layer is ticked (or the view changes) and its points take longer than about
  0.4 s to arrive, the layer card shows a progress bar, the number of points
  ("Loading 207,936 points…", "up to" when filters are applied) and the time waited.
  The server cannot report real progress for one query, so the bar is indeterminate
  the first time and afterwards an estimate based on that layer's previous load time
  (capped at 95% until the data arrives).
- The API protects itself: the database cancels any API query running longer than
  12 s and a request waits at most 5 s for a free connection, so a slow request
  fails with an error and a Retry instead of hanging the server.

## Apply filters

- Filter edits (global region, proximity, per-layer rules) are drafts until the
  user presses **Apply filters** (sticky at the top of the panel; Enter in the
  proximity field also applies). An always-visible status says "Changes not applied
  yet", "Filters applied (N)" or "No filters applied"; the button is disabled when
  there is nothing to apply. Counts, the map and the "N active" badge reflect the
  applied filters only. **Clear all** applies immediately; auto-fit is not a filter
  and applies at once.

## Layer schema and data catalog

- Every imported layer gets a schema (field types: number, boolean, text, date) and a
  data catalog computed from its values at import time. The catalog says which
  filter suits each field: numbers get a **range** (real min/max), text fields with
  fewer than 20 distinct values are **select** fields and show a combobox of their
  values, other text stays a free "contains" box. Booleans offer false/true. Missing
  values (null, empty, NA, -999) are ignored in options and ranges.
- Filter panels use it: "Filter another column" lists the real values, and numeric
  sliders start at the field's real minimum and maximum. Date fields are catalogued
  (`date_range`) but still use the text filter in the UI.
- API: `GET /api/layers/:id` returns `catalog` with `key`, `dataType`, `filterKind`,
  `valueCount`, `missingCount`, `distinctCount`, `min`, `max`, `options` per field.
- Re-importing a CSV rebuilds the catalog. See `backend/services/database/SCHEMA.md`.

## Cross-layer proximity filter

- Global filter "Proximity between layers" (km, 0.1 to 20,000; empty = off). With it
  set, every visible server (imported) layer shows only the points that have a
  point of **every other visible layer** within that distance (great-circle, on the
  WGS84 spheroid). Each layer's own filters and the continent/country filter decide
  which points of the other layers count as a match, so with layer 1 filtered to 10
  items, layer 2 filtered to 20 and a 5 km radius, you see the layer 1 items that
  are within 5 km of one of those 20 (and the layer 2 items near one of those 10).
- Needs at least two visible server layers; with one it removes nothing. A visible
  layer with no matching points leaves the others empty. Static built-in layers do
  not take part.
- Layer counts and the map summary show the filtered totals. The old map-origin
  "Radius Circles" were removed; clicking a point no longer draws circles.
- API: `?filter=` on `/api/layers/:id/clusters` and `/points` accepts
  `near: { km, layers: [{ layerId, filter }] }`; evaluated in PostgreSQL with
  `ST_DWithin` on geography (index `layer_points_geog_idx`).

## Server-side layers from CSV

- Imported outside the app by a local script (`scripts/import_csv.sh <file.csv>`
  or `npm run import -- <file.csv>`) that writes straight into PostgreSQL via
  `DATABASE_URL`; the web app only presents and filters.
- `scripts/geojson_to_csv.sh` converts GeoJSON to a CSV with `lat`/`lon` for import.
- `scripts/migrate.sh` applies pending database migrations (needed on Vercel, which skips them).
- `scripts/list_layers.sh` lists built-in and imported layers; `scripts/delete_layer.sh <id-or-label>` deletes an imported layer (confirmation required). Both run locally, not in the app.
- One transaction per file: all of the layer or nothing.
- Re-importing a file name replaces its layer (layer id derives from the name).
- Invalid-coordinate rows are skipped and counted.
- Layers persist across reloads. The app cannot delete them; remove a layer in
  the database (`DELETE FROM layers WHERE id = ...`; points cascade).

## Viewport clustering

- Large layers are never sent whole. PostGIS grid clustering (`ST_SnapToGrid`,
  ~56 px cells anchored at 0,0) groups points per viewport; GiST index on
  `(layer_id, geom)`.
- Up to 1500 cells per response, with a `truncated` flag.
- Single-point cells come back as plain points; clusters carry count and bounds.
- Antimeridian-aware bounding boxes.
- Click/Enter on a cluster zooms in; coincident points open in a popup list
  (up to 50) in a themed popup with wrapped names, ids and layer colour.
- Debounced refresh on map move, with the previous request aborted.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/layers`, `/api/layers/:id` | Layer index and summary |
| GET | `/api/layers/:id/clusters` | Clustered viewport points |
| GET | `/api/layers/:id/points` | Points in a small box |
| GET | `/api/layers/:id/points/:row` | All columns of one point |
| GET | `/healthz`, `/readyz` | Health and readiness |

## Platform and operations

- One Nuxt 4 project: SPA and Nitro API in a single image, run as the `app`
  service. No worker or queue.
- PostgreSQL + pgvector (with PostGIS for geometry) as the system of record;
  Redis as transport only.
- Forward-only SQL migrations applied at startup under an advisory lock.
- Docker Compose topology with a wrapper script, local override file, and a VM
  topology with Caddy HTTPS.
- Deploy scripts for Cloudflare Pages (front end) and a persistent Docker VM
  (back end).
- Interactive project menu (`scripts/start.sh`).

## Accessibility

Semantic HTML, keyboard-focusable markers, labelled controls, live-region
announcements for import results, non-colour state cues, visible focus and
reduced-motion support.

## Datasets in `data/`

Earth basalt chemistry (GEOROC), temperature and precipitation tables, Moon
training sites, permafrost and tundra data and others, ready to import as CSV.
See [../../data/README.md](../../data/README.md).

## Not yet available

- Authentication and authorization.
