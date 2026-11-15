# spacechallenge

Layer Explorer: a Nuxt 4 / Vue 3 SPA that shows point layers on a Leaflet map.
Built-in layers are static JSON; CSV files from the server's data directory can
be imported asynchronously into PostgreSQL and streamed to the browser over
Server-Sent Events.

- `frontend/app/` is the SPA; `frontend/server/` is the Nitro API and the import
  worker code (one Nuxt project, one Docker image).
- `backend/` holds the Docker Compose topology: `app` (SPA + API), `worker`,
  PostgreSQL with pgvector, and Redis (BullMQ queue).
- `data/` holds the CSV files offered for import.

See [@docs/architecture/ARCHITECTURE.md](@docs/architecture/ARCHITECTURE.md) for
the architecture.

## Get started

1. With Docker and Compose v2 running, start the stack:
   `./backend/docker/compose.sh up --build --detach --wait`.
2. Open `http://localhost:8080` (the `app` service serves the SPA and `/api`).
3. For UI work, run `npm install && npm run dev` in `frontend/`; it needs
   `DATABASE_URL` and `QUEUE_URL` for the API routes, otherwise the API disables
   itself and static layers still work.
4. Use `bash scripts/start.sh` for the interactive project menu. If Node/npm is
   already installed, `npm start` opens the same menu; npm is optional.

See [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md)
and [@docs/BOOTSTRAP.md](@docs/BOOTSTRAP.md) for details.

## Deploy

- `scripts/deploy_frontend.sh` uploads your chosen static build to Cloudflare
  Pages (`pages.dev`). Set `FRONTEND_OUTPUT_DIR` and `PAGES_PROJECT_NAME`.
- `scripts/deploy_backend.sh` deploys all Docker services to a persistent Linux
  VM over SSH. Set `BACKEND_SSH_HOST`, `BACKEND_DEPLOY_DIR`, and `BACKEND_DOMAIN`.
  Use `--dry-run` to preview without connecting.

Read [@docs/DEPLOYMENT.md](@docs/DEPLOYMENT.md) for setup and commands. Both local
and VM-hosted Compose use persistent database and queue volumes. Back up the VM's
data and server environment file before storing important data.
