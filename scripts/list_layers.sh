#!/usr/bin/env bash
# Lists the built-in layers and the layers imported into PostgreSQL (read-only).
# DATABASE_URL comes from the environment, else backend/docker/.env. Usage: scripts/list_layers.sh
set -euo pipefail
[ $# -eq 0 ] || { echo "Usage: $0" >&2; exit 2; }
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/frontend"
exec npm run --silent layers
