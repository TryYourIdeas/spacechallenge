# spacechallenge
Access project here: https://spacechallenge-gamma.vercel.app/

Live demo: https://drive.google.com/file/d/1ZUW1Fs7UxsDBY1_JiLsqSCYN5EyRk4cL/view?usp=sharing


Layer Explorer: a Nuxt 4 / Vue 3 SPA that shows point layers on a Leaflet map.
Built-in layers are static JSON; CSV files are imported into PostgreSQL with a
local script (`scripts/import_csv.sh <file.csv>`) and served to the browser
filtered by viewport. The web app (including Vercel) only presents and filters.

- `frontend/app/` is the SPA; `frontend/server/` is the Nitro API and the import
  script (one Nuxt project, one Docker image).
- `backend/` holds the Docker Compose topology: `app` (SPA + API) and
  PostgreSQL with pgvector and PostGIS.
- `data/` is where you may keep CSV files to import (git-ignored).

See [@docs/architecture/ARCHITECTURE.md](@docs/architecture/ARCHITECTURE.md) for
the architecture.

## Get started

1. With Docker and Compose v2 running, start the stack:
   `./backend/docker/compose.sh up --build --detach --wait`.
2. Open `http://localhost:8080` (the `app` service serves the SPA and `/api`).
3. For UI work, run `npm install && npm run dev` in `frontend/`; it needs
   `DATABASE_URL` for the API routes, otherwise the API disables
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
and VM-hosted Compose use persistent database volumes. Back up the VM's
data and server environment file before storing important data.
