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
