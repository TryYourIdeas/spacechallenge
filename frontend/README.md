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

## Server: read-only API (`server/`)

Nuxt/Nitro also hosts the API, so the app is one project. `server/utils/` holds
the logic (config, Postgres, CSV parsing and import, clustering),
`server/api/` the routes, `server/plugins/services.ts` applies migrations at
start. The
image is defined by `Dockerfile` here; the Compose topology lives in `../backend`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/layers` | imported layers (index) |
| GET | `/api/layers/:id` | layer summary `{fields, skipped, rowCount, bounds}`; **no rows** |
| GET | `/api/layers/:id/clusters?bbox=w,s,e,n&zoom=z` | points in the viewport grouped into grid cells (`{items, truncated}`); `w > e` crosses the antimeridian |
| GET | `/api/layers/:id/points?bbox=w,s,e,n` | up to 50 individual points in a small box (opens clusters that share coordinates) |
| GET | `/api/layers/:id/points/:row` | every column of one point |
| DELETE | `/api/layers/:id` | removes the layer and its points |

Import is not part of the API. `npm run import -- <file.csv>` (or
`../scripts/import_csv.sh`) runs `scripts/import-csv.ts`, which calls
`importCsvFile` (`server/utils/import.ts`): it scans the file, then inserts
points in batches inside one transaction. The layer id is a UUIDv5 of the file
name, so importing the same name again replaces the layer. The `tasks` table from
migration `0002` is no longer used.

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

Environment (see `../backend/docker/.env.example`): `DATABASE_URL`
(required), `MIGRATIONS_DIR`, `CORS_ORIGINS`. Without `DATABASE_URL` the
API is disabled and `nuxt dev` still serves the UI.

Run everything: `./backend/docker/compose.sh up --build --wait` then open
`http://127.0.0.1:8080`. For `nuxt dev` against the Compose databases, publish
Postgres in `compose.local.yaml` and set `DATABASE_URL`.

Known gap: there is no authentication yet, so anyone who can reach the app can
delete layers.

## Deployment targets

- **Docker/VM (full app):** the image serves SPA and API on one origin;
  `NUXT_PUBLIC_API_BASE` stays empty.
- **Static (`npm run build` → `.output/public`, Pages):** SPA only. Build with
  `NUXT_PUBLIC_API_BASE=https://<api host>` and add the Pages origin to the
  server's `CORS_ORIGINS`.

## Importing CSV files

Run `npm run import -- path/to/file.csv` (see `@docs/how-to-use/config.md`). The
browser has no import control; reload the page to see a new layer. Saved layers
reload with the page. Point the app at the API with `NUXT_PUBLIC_API_BASE`
(default empty = same origin); the API must list the site in `CORS_ORIGINS`.
