#!/usr/bin/env bash
# Deletes one imported layer (and its points) from the PostgreSQL named by DATABASE_URL
# (environment, else backend/docker/.env). Asks to confirm unless --yes is given.
# Usage: scripts/delete_layer.sh <layer-id-or-label> [--yes]
set -euo pipefail
{ [ $# -ge 1 ] && [ $# -le 2 ]; } || { echo "Usage: $0 <layer-id-or-label> [--yes]" >&2; exit 2; }
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/frontend"
exec npm run --silent delete-layer -- "$@"
