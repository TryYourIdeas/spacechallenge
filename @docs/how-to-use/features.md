# Features

What Layer Explorer does today. Keep this list in step with the code.

## Map and layers

- Interactive Leaflet world map on a dark, deep-space themed UI (Geist
  typography; Arctic Cyan and Royal Purple highlights).
- Built-in static layers loaded from `frontend/public/data/`: launch sites,
  ground stations, meteorite finds. Defined in `layers.json` (id, label,
  description, marker shape, `#RRGGBB` colour, source table).
- Distinct marker shape and colour per layer; per-layer visibility toggles.
- Per-layer status: point count, skipped invalid rows, loading and error states
  with retry.
- Point details panel with all fields of the selected point.

## Server-side layers from CSV

- Imported outside the app by a local script (`scripts/import_csv.sh <file.csv>`
  or `npm run import -- <file.csv>`) that writes straight into PostgreSQL via
  `DATABASE_URL`; the web app only presents and filters.
- One transaction per file: all of the layer or nothing.
- Re-importing a file name replaces its layer (layer id derives from the name).
- Invalid-coordinate rows are skipped and counted.
- Layers persist across reloads and can be deleted from the panel.

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
| DELETE | `/api/layers/:id` | Remove a layer |
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
