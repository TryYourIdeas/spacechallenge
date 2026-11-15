# Frontend

Nuxt 4 SPA (`ssr: false`, static output) with Leaflet. Browsers never reach the
database; today the layer tables are static JSON in `public/data/`, loaded only
through `app/composables/useLayers.ts`, so moving to the API is a one-file change.

```sh
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (parser + shipped data)
npm run typecheck
npm run build      # static site in .output/public (also linked as dist/)
```

Deploy: `FRONTEND_OUTPUT_DIR=frontend/dist PAGES_PROJECT_NAME=<name> bash scripts/deploy_frontend.sh`.

## Layer data contract

`public/data/layers.json` lists layers (`id`, `label`, `description`, `shape`,
`color` as `#RRGGBB`, `source`). Each `source` is a table:
`{ "fields": [{key,label,type: string|number|date,unit?}], "rows": [{id, latitude, longitude, ...fields}] }`.
Rows with missing/out-of-range WGS84 coordinates or duplicate ids are skipped and
counted in the layer panel.

## Server: API and import worker (`server/`)

Nuxt/Nitro also hosts the API, so the app is one project. `server/utils/` holds
the logic (config, Postgres, BullMQ queue, CSV parsing, import, SSE hub),
`server/api/` the routes, `server/plugins/services.ts` applies migrations at
start and (for `APP_ROLE=worker|all`) starts the queue consumer. The
image is defined by `Dockerfile` here; the Compose topology lives in `../backend`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/files` | visible `*.csv` files in the data directory |
| POST | `/api/imports` | JSON `{"file": "<name from /api/files>"}` → `202` + task; `409` if that file is already importing |
| GET | `/api/tasks`, `/api/tasks/:id` | task rows (`queued` / `processing` / `done` / `failed`) |
| GET | `/api/events` | Server-Sent Events: one `snapshot` (recent tasks), then a `task` event per change |
| GET | `/api/layers` | imported layers (index) |
| GET | `/api/layers/:id` | layer summary `{fields, skipped, rowCount, bounds}`; **no rows** |
| GET | `/api/layers/:id/clusters?bbox=w,s,e,n&zoom=z` | points in the viewport grouped into grid cells (`{items, truncated}`); `w > e` crosses the antimeridian |
| GET | `/api/layers/:id/points?bbox=w,s,e,n` | up to 50 individual points in a small box (opens clusters that share coordinates) |
| GET | `/api/layers/:id/points/:row` | every column of one point |
| DELETE | `/api/layers/:id` | removes the layer and its points (the task row is kept as history) |

Flow: `POST /api/imports` inserts a `tasks` row (`queued`) and enqueues a BullMQ
job whose id is the task id. The worker marks it `processing`, scans the file
(`progressTotal` is `null`, `progressDone` = rows read), then inserts points in
batches inside one transaction and sets `done` or `failed`. Every change is saved
to `tasks` and published on the Redis channel `task-events`; each web instance
forwards it to its SSE clients. Events carry the whole task and `updatedAt`, so
clients keep the newest. Imports are replay-safe (layer id = task id); file
problems are non-retryable, other errors retry 3 times with backoff; the worker
re-enqueues tasks idle for more than 2 minutes.

Viewport clustering: server layers are never sent whole. `layer_points.geom`
(PostGIS, generated from latitude/longitude, GiST index on `(layer_id, geom)`)
serves viewport queries. `/clusters` filters with `&&` and groups with
`ST_SnapToGrid` using ~56 px cells (`56 * 360 / (256 * 2^zoom)` degrees), anchored
at (0, 0) so cells stay stable while panning. A cell with one point is returned as
that point; others carry `count` and `bounds`. At most 1500 cells are returned
(`truncated` is set beyond that). The map refetches on `moveend` (debounced,
previous request aborted); static layers in `public/data` still load whole.

Tests: `npm test`. The PostGIS integration test
(`tests/server/points.integration.test.ts`) is skipped unless `TEST_DATABASE_URL`
points at a PostgreSQL with PostGIS where the role may `CREATE DATABASE` (it uses
a scratch database and drops it). Against the Compose stack, use the postgres
container's address, for example
`TEST_DATABASE_URL=postgresql://app:app@$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' <project>-postgres-1):5432/app npm test`.

CSV rules: a `lat`/`latitude` and a `lon`/`lng`/`longitude` column are required;
other columns are kept. Rows with invalid coordinates are skipped and counted.

Environment (see `../backend/docker/.env.example`): `DATABASE_URL`, `QUEUE_URL`
(required), `APP_ROLE` (`web`, `worker`, default `all`), `SOURCE_DIR`,
`MIGRATIONS_DIR`, `CORS_ORIGINS`, `IMPORT_ATTEMPTS`. Without `DATABASE_URL` the
API is disabled and `nuxt dev` still serves the UI.

Run everything: `./backend/docker/compose.sh up --build --wait` then open
`http://127.0.0.1:8080`. For `nuxt dev` against the Compose databases, publish
Postgres/Redis in `compose.local.yaml` and set `DATABASE_URL`/`QUEUE_URL`.

Known gap: there is no authentication yet, so anyone who can reach the app can
start imports and delete layers.

## Deployment targets

- **Docker/VM (full app):** the image serves SPA and API on one origin;
  `NUXT_PUBLIC_API_BASE` stays empty.
- **Static (`npm run build` → `.output/public`, Pages):** SPA only. Build with
  `NUXT_PUBLIC_API_BASE=https://<api host>` and add the Pages origin to the
  server's `CORS_ORIGINS`.

## Importing CSV files

**Import CSV…** lists the `*.csv` files in the server's data directory; picking
one asks the API to import it into PostgreSQL in the background. The panel shows
live progress (scanning, importing N of M points, done, failed) from the API's
Server-Sent Events stream (`/api/events`); the layer appears when the task is
`done`. Saved layers reload with the page. Point the app at the API with
`NUXT_PUBLIC_API_BASE` (default empty = same origin); the API must list the
site in `CORS_ORIGINS`.
