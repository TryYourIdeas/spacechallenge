# Configuration

How to configure and start Layer Explorer. For architecture see
[../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md); for VM and
Pages deployment see [../DEPLOYMENT.md](../../@docs/DEPLOYMENT.md).

## Prerequisites

- Docker with Compose v2 (full stack), or Node.js and npm (UI development only).
- CSV files to import placed in the `data/` directory.

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
| `app` | `APP_ROLE=web`: SPA, `/api`, Server-Sent Events, `/healthz`, `/readyz` |
| `worker` | `APP_ROLE=worker`: BullMQ consumer that runs CSV imports |
| `postgres` | PostgreSQL with pgvector and PostGIS (image set by `POSTGRES_IMAGE`); system of record |
| `queue` | Redis; queue transport and task-event channel |

`app` and `worker` are the same image, built from `frontend/Dockerfile`.
Database migrations are applied by the app at startup.

## Environment files

Copy `backend/docker/.env.example` to `backend/docker/.env` to change local
defaults. `.env` is ignored by git; never commit secrets.
`backend/docker/compose.local.yaml` is an ignored per-developer override (for
example to publish Postgres/Redis ports for `nuxt dev`).

### Compose variables (`backend/docker/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_PORT` | `8080` | Host port (bound to `127.0.0.1`) |
| `API_CONTAINER_PORT` | `8080` | Port inside the container |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins allowed to call the API |
| `DATA_DIR` | `../../data` | Host directory whose `*.csv` files can be imported (mounted read-only) |
| `POSTGRES_IMAGE` | `jlabrada/postgis-pgvector:0.1.0` | Database image. Must provide both pgvector and PostGIS (migration `0003` creates the `postgis` extension); plain `pgvector/pgvector` images fail |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `app` / `app` / `app` | Local-only defaults; replace beyond local development |
| `QUEUE_IMAGE` | `redis:7-alpine` | Queue image |
| `DATABASE_URL` | (unset) | Optional external database instead of the bundled `postgres` |

### Application variables (read by `frontend/server/`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL connection string |
| `QUEUE_URL` | required | Redis connection string |
| `APP_ROLE` | `all` | `web`, `worker` or `all` |
| `SOURCE_DIR` | `/data/source` (container) or `../data` | Directory scanned for CSV files |
| `MIGRATIONS_DIR` | `/app/migrations` or `backend/services/database/migrations` | Migration SQL |
| `CORS_ORIGINS` | localhost:3000 origins | Allowed browser origins |
| `IMPORT_ATTEMPTS` | `3` | Retry limit for a failing import job |
| `IMPORT_STALE_SECONDS` | `120` | Idle time after which the worker re-enqueues a task |
| `NUXT_PUBLIC_API_BASE` | empty | API origin for the SPA (empty = same origin); no trailing slash |

Without `DATABASE_URL` the API disables itself; the SPA still shows the
built-in static layers.

## UI development

```sh
cd frontend
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run typecheck
npm run build        # static site in .output/public
```

To use the API from `nuxt dev`, publish Postgres and Redis in
`compose.local.yaml` and set `DATABASE_URL` and `QUEUE_URL`.

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

## Known limitation

There is no authentication yet: anyone who can reach the app can start imports
and delete layers. Keep it on a trusted network.
