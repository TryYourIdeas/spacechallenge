#!/usr/bin/env bash
# Applies pending database migrations to the PostgreSQL named by DATABASE_URL
# (environment, else backend/docker/.env). Idempotent. Usage: scripts/migrate.sh
set -euo pipefail
[ $# -eq 0 ] || { echo "Usage: $0" >&2; exit 2; }
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/frontend"
exec npm run --silent migrate
