# Deployment

Frontend: Cloudflare Pages (`pages.dev`). Backend: an existing persistent Linux
VM running Docker Compose. Choose any application languages and frameworks.
The scripts do not purchase or provision a VM or modify your DNS/firewall.

## Frontend → Cloudflare Pages

The frontend is a Nuxt SPA. `npm run build` (`nuxt generate`) in `frontend/`
writes a static site to `frontend/.output/public`. Set `NUXT_PUBLIC_API_BASE` at
build time to the API's HTTPS origin (no trailing slash), then upload only that
output directory:

```sh
NUXT_PUBLIC_API_BASE=https://api.example.com \
FRONTEND_BUILD_COMMAND='npm run build' \
FRONTEND_OUTPUT_DIR=frontend/.output/public PAGES_PROJECT_NAME=my-team \
  bash scripts/deploy_frontend.sh
```

Without Pages, the `app` container also serves the SPA from the same origin as
the API (`NUXT_PUBLIC_API_BASE` empty).

The output directory is relative to the project root or absolute and must contain
`index.html`. Optionally set `FRONTEND_BUILD_COMMAND` to run a build command from
`frontend/` before uploading. Static export is required for SSR frameworks.

The script runs pinned Wrangler via npx (Node/npm is deployment tooling, not an
application language choice). Set `WRANGLER_BIN` to use an existing compatible
CLI. Authenticate with `npx wrangler@4.161.0 login`. CI can provide
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as secrets. On first deployment
Wrangler offers to create the Pages project. For CI create it first with
`npx wrangler@4.161.0 pages project create my-team --production-branch main`.
`PAGES_BRANCH` defaults to `main`; other values deploy previews. Use the actual
`pages.dev` URL printed by Wrangler.

## Backend → persistent Docker VM

Use a Linux VM with persistent disk and sufficient space for container images,
PostgreSQL/pgvector, Redis, build caches, and source releases. Any provider is
supported. Keep Docker's data directory on persistent storage. Enable the Docker
service at boot; the Compose services use `restart: unless-stopped`.

Before deploying:

1. Install Docker Engine with Compose v2.24.4+ on the VM, plus Bash, rsync,
   OpenSSL, `flock` (util-linux), and curl 7.71+. The SSH account must be able to
   use Docker and write to the deployment directory; provision these permissions
   on the VM. The deploy script does not install software or invoke sudo.
2. Install SSH and rsync on your laptop. Configure SSH keys/agent and verify the
   host's identity with a normal SSH connection first. The script requires a
   known host and noninteractive authentication; it never disables host checks.
3. Point `api.example.com` at the VM. Allow SSH and public inbound TCP 80/443;
   keep database and Redis ports private. Use a dedicated VM or ensure ports
   80/443 are free for the included Caddy proxy. DNS must resolve to this VM for
   Caddy's automatic HTTPS certificate validation.
4. Pick a stable absolute deployment directory, for example `/srv/my-team`,
   writable by the deployment account. Remote paths intentionally exclude spaces
   and shell metacharacters. Use an SSH-config alias for IPv6 hosts.

Preview without any network access, then deploy:

```sh
BACKEND_SSH_HOST=deploy@your-vm BACKEND_DEPLOY_DIR=/srv/my-team \
  BACKEND_DOMAIN=api.example.com bash scripts/deploy_backend.sh --dry-run

BACKEND_SSH_HOST=deploy@your-vm BACKEND_DEPLOY_DIR=/srv/my-team \
  BACKEND_DOMAIN=api.example.com bash scripts/deploy_backend.sh
```

Optional variables:

- `BACKEND_PROJECT_NAME`: fixed Compose project name; defaults to the local
  project directory's sanitized name. Once initialized, the VM refuses a
  different name to protect volume identity. Set it explicitly in CI, where
  checkout directory names can differ from developer machines.
- `BACKEND_SSH_PORT`: optional SSH port; otherwise SSH config supplies it.
- `BACKEND_HEALTH_PATH`: endpoint returning HTTP 2xx, default `/`; `/readyz` also checks PostgreSQL and Redis.

The script uploads **only backend source**, excluding laptop `.env` files,
local Compose overrides, Git metadata, and common dependency caches. It creates
a unique source release, builds images on the VM for that machine's architecture,
and starts every Compose service with `--wait`. The `app` and `worker` services
share one image built from the Nuxt project in `frontend/` by
`frontend/Dockerfile`; local application compilers are unnecessary.
The script uploads both `backend/` and `frontend/` (without `node_modules`,
`.nuxt`, `.output`, or `.env*`). Private images need registry authentication on
the VM; image-only services are pulled before startup.

The hosted topology adds Caddy on ports 80/443 and proxies to `app` over the
private Docker network. PostgreSQL and Redis use service DNS and have no public
ports. The local app port remains loopback-only for local development. The API runs
inside the `app` service (`frontend/server/`); the `worker` service consumes the
import queue. Both apply database migrations at startup. See
`docs/architecture/ARCHITECTURE.md`.

After the services start, deployment checks the API's HTTPS health URL. Only
then does `current` point to the successful release. A failed deploy returns a
nonzero status and leaves data volumes intact; it may already have changed
running containers. The `current` pointer is a success record, **not automatic
rollback**. Inspect logs and redeploy a known-good source version to recover;
application migrations need their own forward-recovery strategy. Deploys can
briefly interrupt requests; this is a single-VM stack, not zero-downtime HA.

## Server secrets and persistent data

The server layout is:

```text
/srv/my-team/
├── shared/
│   ├── backend.env       # server-only, mode 600
│   └── compose-project   # fixed volume namespace
├── releases/<release>/   # backend source; docker/.env links to shared env
└── current -> releases/<last-successful-release>
```

On first deploy the VM copies the secret-free example and generates a random
PostgreSQL password locally. Later deploys retain the environment file and its
password, updating only `BACKEND_DOMAIN`. Edit `shared/backend.env` on the VM
for real application secrets and settings. Do not put secrets in source files,
Docker build arguments, or environment examples. Restart/redeploy services after
changing environment settings. Changing the PostgreSQL password environment
variable alone does not rotate an already initialized database role.

Compose uses the same project name on each deploy, so PostgreSQL data, Redis
AOF data, and Caddy certificates live in stable named Docker volumes outside
source releases. Container recreation and VM reboots preserve these volumes
when the underlying VM disk is retained. The deploy script does not run
`down --volumes` or volume pruning. Keep Redis job handling idempotent and
recoverable; filesystem persistence alone is not a guarantee of job delivery.

Persistent disk is not a backup. Arrange database-aware backups, protect the
server environment file, and test restore before storing important data.
Deleting/replacing the VM or its disk still requires recovery from backups.
Old source releases are retained for inspection; clean them manually only after
checking bind mounts and retaining backups. Do not remove shared state or volumes.

## Connect frontend to backend

Build your frontend with `NUXT_PUBLIC_API_BASE=https://api.example.com`. Set
`CORS_ORIGINS` in `shared/backend.env` to the exact Pages origin, such as
`https://my-team.pages.dev`, and implement authentication/authorization in your
API (none exists yet: import and delete routes are unauthenticated). Do not expose database credentials to frontend builds. Caddy handles HTTPS
and proxying; it does not add authentication or wildcard CORS.

For server operations, use the last successful source directory and fixed name:

```sh
cd /srv/my-team/current
BACKEND_DEPLOYMENT=vm COMPOSE_PROJECT_NAME=my-team bash docker/compose.sh ps
BACKEND_DEPLOYMENT=vm COMPOSE_PROJECT_NAME=my-team bash docker/compose.sh logs --tail 100
```

Use the actual project name stored in `shared/compose-project`.

## References

- [Pages direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Docker named volumes](https://docs.docker.com/engine/storage/volumes/)
- [Compose configuration merging](https://docs.docker.com/reference/compose-file/merge/)
- [Caddy HTTPS reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy)

## Import data directory

The API and worker read importable CSV files from `DATA_DIR`, mounted read-only
at `/data/source`. Deployments upload only `backend/`, so the repository's
`data/` folder is not on the VM: create a persistent directory outside the
release folders, copy the CSV files there yourself, and set its absolute path
as `DATA_DIR` in `shared/backend.env`. Without it Compose falls back to a
nonexistent `../../data` path and the file list will be empty.
