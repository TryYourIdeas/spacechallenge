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

## Importing CSV files

**Import CSV…** lists the `*.csv` files in the server's data directory; picking
one asks the API to import it into PostgreSQL in the background. The panel shows
live progress (scanning, importing N of M points, done, failed) from the API's
Server-Sent Events stream (`/api/events`); the layer appears when the task is
`done`. Saved layers reload with the page. Point the app at the API with
`NUXT_PUBLIC_API_BASE` (default `http://127.0.0.1:8080`); the API must list the
site in `CORS_ORIGINS`.
