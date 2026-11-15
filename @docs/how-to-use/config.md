# Configuration

How to configure and start Layer Explorer. For architecture see
[../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md); for VM and
Pages deployment see [../DEPLOYMENT.md](../../@docs/DEPLOYMENT.md).

## Prerequisites

- Docker with Compose v2 (full stack), or Node.js and npm (UI development only).
- CSV files to import (anywhere on your machine) and `DATABASE_URL`; see [Importing data](#importing-data).

## Quick start (Docker)

```sh
./backend/docker/compose.sh up --build --detach --wait
```

Then open `http://localhost:8080`. The same entry point serves `ps`, `logs`,
`down` and other Compose subcommands, for example
`./backend/docker/compose.sh logs --follow app`.

`bash scripts/start.sh` (or `npm start`) opens an interactive menu with
Start, Build, Deploy backend, Deploy frontend and Exit.

## Services

| Service | Role |
| --- | --- |
| `app` | SPA, read-only `/api` (layers, clusters, points), `/healthz`, `/readyz` |
| `postgres` | PostgreSQL with pgvector and PostGIS (image set by `POSTGRES_IMAGE`); system of record |

The image is built from `frontend/Dockerfile`. Database migrations are applied by
the app at startup. Data is loaded with the import script, not through the app.

## Environment files

Copy `backend/docker/.env.example` to `backend/docker/.env` to change local
defaults. `.env` is ignored by git; never commit secrets.
`backend/docker/compose.local.yaml` is an ignored per-developer override (for
example to publish the Postgres port for `nuxt dev`).

### Compose variables (`backend/docker/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_PORT` | `8080` | Host port (bound to `127.0.0.1`) |
| `API_CONTAINER_PORT` | `8080` | Port inside the container |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins allowed to call the API |
| `POSTGRES_IMAGE` | `jlabrada/postgis-pgvector:0.1.0` | Database image. Must provide both pgvector and PostGIS (migration `0003` creates the `postgis` extension); plain `pgvector/pgvector` images fail |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `app` / `app` / `app` | Local-only defaults; replace beyond local development |
| `DATABASE_URL` | (unset) | Optional external database instead of the bundled `postgres` |

### Application variables (read by `frontend/server/`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL connection string |
| `MIGRATIONS_DIR` | `/app/migrations` or `backend/services/database/migrations` | Migration SQL |
| `CORS_ORIGINS` | localhost:3000 origins | Allowed browser origins |
| `NUXT_PUBLIC_API_BASE` | empty | API origin for the SPA (empty = same origin); no trailing slash |

Without `DATABASE_URL` the API disables itself; the SPA still shows the
built-in static layers.

### Using an external database

Set `DATABASE_URL` in `backend/docker/.env` (ignored by git), for example
`DATABASE_URL=postgres://user:password@host:5432/dbname`. Compose passes it to
`app`; when unset it uses the bundled `postgres` service. The
bundled `postgres` container still starts but is unused. For a VM, put the
value in `shared/backend.env` instead.

Requirements on the external database:

- **Extensions.** Migrations run at app startup and execute
  `CREATE EXTENSION IF NOT EXISTS` for `postgis` and `btree_gist` (migration
  `0003`); `vector` (pgvector) is also needed. The server must have the
  PostGIS and pgvector packages installed.
- **Superuser step.** `postgis` is not a trusted extension, so a non-superuser
  role fails with `permission denied to create extension "postgis"` / `Must be
  superuser to create this extension`, and the app logs it at startup
  with no schema created. A superuser must run this once in the target database
  before the first start:

  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

  The migrations then find the extensions present and succeed as the normal
  role, which also needs `CREATE` on the database/schema.
- **Health check.** `/readyz` can report `ready` even when migrations failed,
  so check `./backend/docker/compose.sh logs app` after the first start.
- **Transport.** Port 5432 is plain text unless the server enforces SSL; append
  `?sslmode=require` to the URL if it does.

## UI development

```sh
cd frontend
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run typecheck
npm run build        # static site in .output/public
```

To use the API from `nuxt dev`, publish Postgres in
`compose.local.yaml` and set `DATABASE_URL`.

The PostGIS integration test runs only when `TEST_DATABASE_URL` points at a
PostgreSQL with PostGIS where the role may `CREATE DATABASE`.

## Deployment

- Same origin (Docker or VM): leave `NUXT_PUBLIC_API_BASE` empty.
- Static front end on Cloudflare Pages: build with
  `NUXT_PUBLIC_API_BASE=https://<api host>` and add the Pages origin to the
  server's `CORS_ORIGINS`.
- `scripts/deploy_frontend.sh` (needs `FRONTEND_OUTPUT_DIR`, `PAGES_PROJECT_NAME`)
  and `scripts/deploy_backend.sh` (needs `BACKEND_SSH_HOST`,
  `BACKEND_DEPLOY_DIR`, `BACKEND_DOMAIN`; supports `--dry-run`).
  Server secrets live in `shared/backend.env` on the VM.

## Deploying the Nuxt app to Vercel

`frontend/vercel.json` builds the app with `npm run build:server`; Nitro detects
Vercel and emits `.vercel/output` (SPA plus `/api`, `/healthz`, `/readyz` as
functions). Verified by a containerised build only; no deployment was run.

1. Import the repository in Vercel and set **Root Directory** to `frontend`.
2. Set environment variables (Production and Preview):
   - `DATABASE_URL`: the external PostgreSQL (see above; add `?sslmode=require`
     if supported).
   - `NUXT_PUBLIC_API_BASE` empty (same origin). Nothing else is needed: Vercel
     only presents and filters data; it never imports.
3. Deploy: `npx vercel deploy --prod` from `frontend/`, or push to the
   connected branch.

Limits of serverless hosting:

- When `VERCEL` is set the server skips migrations. Apply them by running the
  Docker `app` once against the same database, or by running `npm run import`.
- Import data from your machine with the script (below); Vercel serves what is
  in the database.
- The API is read-only but has no authentication (see below); a public Vercel URL exposes all layer data. Enable Vercel Deployment Protection if the data is private.

## Importing data

CSV files are imported with a local script that writes straight into the
PostgreSQL named by `DATABASE_URL`; the web app (including Vercel) only
presents and filters data.

```sh
scripts/import_csv.sh path/to/file.csv        # or: cd frontend && npm run import -- path/to/file.csv
```

- `DATABASE_URL` comes from the environment, else from `backend/docker/.env`.
  The password is never printed.
- The script applies pending migrations, then imports the file in one
  transaction: either the whole layer is stored or nothing is.
- The layer is named after the file (`basaltos_terra.csv` -> `basaltos_terra`).
  Importing the same file name again replaces that layer.
- The CSV needs latitude and longitude columns; rows without valid coordinates
  are skipped and counted. It exits non-zero with a message on any error.
- Reload the app to see a new layer.

### Converting GeoJSON to CSV

```sh
scripts/geojson_to_csv.sh places.geojson [out.csv]   # or: cd frontend && npm run geojson-to-csv -- places.geojson
```

Writes `places.csv` beside the input (or to `out.csv`) with `lat` and `lon`
columns followed by one column per feature property, ready for the import
script. It never overwrites an existing file.

- Accepts a FeatureCollection, a Feature or a bare geometry.
- `Point` gives one row; `MultiPoint` and `GeometryCollection` give one row per
  point. Lines and polygons give one row at the mean of their vertices (an
  approximation, not a true centroid; polygon holes are ignored).
- Nested property values are written as JSON; a property named like a coordinate
  column (`lat`, `lon`, `longitude`...) is renamed with a `prop_` prefix.
- Features without usable coordinates are skipped and counted in the output.

## Known limitation

The app is read-only (no route writes or deletes data) and has no authentication: anyone who can reach it can read every layer. Keep it on a trusted network if the data is private.
