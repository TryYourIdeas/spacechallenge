# Backend

This directory is a Docker Compose application made of PostgreSQL, Redis and one application image run as two services:

- `api` and `worker` are built from `services/api` (Node + Fastify): the HTTP API
  (including Server-Sent Events) and the asynchronous CSV import worker, which
  reads files from `DATA_DIR` (mounted read-only). See `services/api/README.md`.
- `postgres` is PostgreSQL with the `pgvector` extension enabled.
- `queue` is Redis, a small queue/broker suitable for background work.

Use the backend-owned Compose wrapper from the project root:

```sh
./backend/docker/compose.sh up --wait
```

`API_PORT`/`API_CONTAINER_PORT` and `CORS_ORIGINS` are set in `backend/docker/.env`.
`docker/compose.local.yaml` is strictly for developer-machine overrides; the
wrapper loads it automatically and keeps it out of version control.

The wrapper is also the single entry point for `ps`, `logs`, `down`, and other
Docker Compose subcommands:

```sh
./backend/docker/compose.sh ps
./backend/docker/compose.sh logs --follow api
```

Database initialization SQL belongs in `services/database/init/`; versioned
application migrations belong in `services/database/migrations/`.

## VM deployment

`bash scripts/deploy_backend.sh` from the project root deploys every Compose
service to a persistent Linux VM. Set `BACKEND_SSH_HOST`, `BACKEND_DEPLOY_DIR`,
and `BACKEND_DOMAIN` first. The tracked `docker/compose.vm.yaml` adds a Caddy
HTTPS reverse proxy and removes the API's direct host port. Internal API,
database, and queue communication uses Docker service DNS. Named volumes persist
across container replacements and deployments on the same VM.
See `../@docs/DEPLOYMENT.md` for setup, operations, and backup responsibilities.
