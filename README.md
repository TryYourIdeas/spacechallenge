# spacechallenge

A language-agnostic project workspace. Choose your frontend and API languages
and frameworks; the directories are ready for your code.

The local backend includes an HTTP placeholder, PostgreSQL with pgvector, and
Redis. No application frontend or API has been implemented yet.

## Get started

1. Add your frontend in `frontend/` and your API in `backend/services/api/`.
2. With Docker and Compose v2 running, start the local infrastructure:
   `./backend/docker/compose.sh up --detach --wait`.
3. Visit `http://localhost:8080` to see the HTTP placeholder.
4. Use `bash scripts/start.sh` for the interactive project menu. If Node/npm is
   already installed, `npm start` opens the same menu; npm is optional.

See [backend/README.md](backend/README.md) to connect your application, and
[@docs/BOOTSTRAP.md](@docs/BOOTSTRAP.md) for setup and next steps.

## Deploy

- `scripts/deploy_frontend.sh` uploads your chosen static build to Cloudflare
  Pages (`pages.dev`). Set `FRONTEND_OUTPUT_DIR` and `PAGES_PROJECT_NAME`.
- `scripts/deploy_backend.sh` deploys all Docker services to a persistent Linux
  VM over SSH. Set `BACKEND_SSH_HOST`, `BACKEND_DEPLOY_DIR`, and `BACKEND_DOMAIN`.
  Use `--dry-run` to preview without connecting.

Read [@docs/DEPLOYMENT.md](@docs/DEPLOYMENT.md) for setup and commands. Both local
and VM-hosted Compose use persistent database and queue volumes. Back up the VM's
data and server environment file before storing important data.
